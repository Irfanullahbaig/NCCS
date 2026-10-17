import bcrypt from "bcryptjs";
import { db, newId, nowIso } from "../src/lib/db";
import type { StudentType } from "../src/lib/enums";
import { ensureStudentFeeRecord, recordExpense, recordIncome, recordStudentPayment } from "../src/lib/finance";
import { recordSalaryPayment } from "../src/lib/salary";

if (process.env.NCCS_USE_DUMMY_DATA !== "1" && process.env.NCCS_ALLOW_SEED !== "1") {
  console.error("Refusing to seed because this wipes the live Supabase database. Re-run with NCCS_ALLOW_SEED=1 only if you intend to replace all data, or NCCS_USE_DUMMY_DATA=1 for a local file store.");
  process.exit(1);
}

async function deleteAll(table: "AuditLog" | "SalaryPayment" | "SalaryRecord" | "FeePayment" | "IncomeTransaction" | "ExpenseTransaction" | "FeeRecord" | "Student" | "StaffAssignment" | "Staff" | "Subject" | "Program" | "AcademicYear" | "Setting" | "User" | "Class", column = "id") {
  const result = await db().from(table).delete().not(column, "is", null);
  if (result.error) throw result.error;
}

async function main() {
  const joinDeletes = await Promise.all([
    db().from("FeePayment").delete().not("id", "is", null),
    db().from("SalaryPayment").delete().not("id", "is", null),
  ]);
  for (const result of joinDeletes) {
    if (result.error) throw result.error;
  }

  await deleteAll("SalaryRecord");
  await deleteAll("IncomeTransaction");
  await deleteAll("ExpenseTransaction");
  await deleteAll("FeeRecord");
  await deleteAll("Student");
  await deleteAll("StaffAssignment");
  const staffSubjects = await db().from("StaffSubject").delete().not("staffId", "is", null);
  if (staffSubjects.error) throw staffSubjects.error;
  const classSubjects = await db().from("ClassSubject").delete().not("classId", "is", null);
  if (classSubjects.error) throw classSubjects.error;
  await deleteAll("Class");
  await deleteAll("Staff");
  await deleteAll("Subject");
  await deleteAll("Program");
  await deleteAll("AcademicYear");
  await deleteAll("AuditLog");
  await deleteAll("Setting");
  const sequences = await db().from("Sequence").delete().not("name", "is", null);
  if (sequences.error) throw sequences.error;
  await deleteAll("User");

  const stamp = nowIso();
  const adminRes = await db()
    .from("User")
    .insert({
      id: newId(),
      name: "System Admin",
      email: "admin@nccs.edu",
      passwordHash: await bcrypt.hash("Admin@123", 12),
      role: "ADMIN",
      createdAt: stamp,
      updatedAt: stamp,
    })
    .select()
    .single();
  if (adminRes.error) throw adminRes.error;
  const admin = adminRes.data;

  const otherUsers = await db().from("User").insert([
    {
      id: newId(),
      name: "College Principal",
      email: "principal@nccs.edu",
      passwordHash: await bcrypt.hash("Principal@123", 12),
      role: "PRINCIPAL",
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: newId(),
      name: "Finance Accountant",
      email: "accountant@nccs.edu",
      passwordHash: await bcrypt.hash("Accountant@123", 12),
      role: "ACCOUNTANT",
      createdAt: stamp,
      updatedAt: stamp,
    },
  ]);
  if (otherUsers.error) throw otherUsers.error;

  const settings = await db().from("Setting").insert([
    { id: newId(), key: "schoolName", value: "NCCS" },
    { id: newId(), key: "schoolAddress", value: "Main Campus, Islamabad" },
    { id: newId(), key: "schoolPhone", value: "051-0000000" },
    { id: newId(), key: "currencyPrefix", value: "Rs." },
  ]);
  if (settings.error) throw settings.error;

  const yearRes = await db()
    .from("AcademicYear")
    .insert({
      id: newId(),
      name: "2026-2027",
      startDate: nowIso(new Date(2026, 3, 1)),
      endDate: nowIso(new Date(2027, 2, 31)),
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: admin.id,
    })
    .select()
    .single();
  if (yearRes.error) throw yearRes.error;
  const year = yearRes.data;

  const programRows = await Promise.all(
    ["ICS", "FA", "FSC", "ICOM", "Local System"].map(async (name) => {
      const created = await db()
        .from("Program")
        .insert({
          id: newId(),
          name,
          createdAt: stamp,
          updatedAt: stamp,
          createdById: admin.id,
        })
        .select()
        .single();
      if (created.error) throw created.error;
      return created.data;
    }),
  );
  const [ics, fa, fsc, icom] = programRows;

  const subjectData = [
    ["CS", "Computer Science"],
    ["PHY", "Physics"],
    ["CHM", "Chemistry"],
    ["MTH", "Mathematics"],
    ["ENG", "English"],
    ["URD", "Urdu"],
    ["ACC", "Accounting"],
    ["ECO", "Economics"],
  ];
  const subjects = await Promise.all(
    subjectData.map(async ([code, name]) => {
      const created = await db()
        .from("Subject")
        .insert({
          id: newId(),
          code,
          name,
          createdAt: stamp,
          updatedAt: stamp,
          createdById: admin.id,
        })
        .select()
        .single();
      if (created.error) throw created.error;
      return created.data;
    }),
  );
  const byCode = Object.fromEntries(subjects.map((subject) => [subject.code, subject]));

  async function addStaff(input: {
    staffId: string;
    firstName: string;
    lastName: string;
    qualification: string;
    dateOfJoining: Date;
    contactNumber: string;
    emergencyContact?: string;
    email: string;
    address: string;
    gender: "MALE" | "FEMALE";
    salaryAmount: number;
    facultyType?: "PERMANENT" | "VISITING";
    subjectIds: string[];
  }) {
    const created = await db()
      .from("Staff")
      .insert({
        id: newId(),
        staffId: input.staffId,
        firstName: input.firstName,
        lastName: input.lastName,
        qualification: input.qualification,
        dateOfJoining: nowIso(input.dateOfJoining),
        contactNumber: input.contactNumber,
        emergencyContact: input.emergencyContact ?? null,
        email: input.email,
        address: input.address,
        gender: input.gender,
        employmentStatus: "ACTIVE",
        facultyType: input.facultyType ?? "PERMANENT",
        salaryAmount: input.salaryAmount,
        createdAt: stamp,
        updatedAt: stamp,
        createdById: admin.id,
      })
      .select()
      .single();
    if (created.error) throw created.error;
    if (input.subjectIds.length) {
      const links = await db()
        .from("StaffSubject")
        .insert(input.subjectIds.map((subjectId) => ({ staffId: created.data.id, subjectId })));
      if (links.error) throw links.error;
    }
    return created.data;
  }

  const teacherSara = await addStaff({
    staffId: "STF-0001",
    firstName: "Sara",
    lastName: "Malik",
    qualification: "MSc Computer Science",
    dateOfJoining: new Date(2022, 7, 15),
    contactNumber: "0300-1111111",
    emergencyContact: "0300-2222222",
    email: "sara.malik@nccs.edu",
    address: "Islamabad",
    gender: "FEMALE",
    salaryAmount: 50000,
    subjectIds: [byCode.CS.id, byCode.MTH.id],
  });
  const teacherImran = await addStaff({
    staffId: "STF-0002",
    firstName: "Imran",
    lastName: "Qureshi",
    qualification: "MPhil Physics",
    dateOfJoining: new Date(2020, 1, 10),
    contactNumber: "0300-3333333",
    emergencyContact: "0300-4444444",
    email: "imran.qureshi@nccs.edu",
    address: "Rawalpindi",
    gender: "MALE",
    salaryAmount: 60000,
    subjectIds: [byCode.PHY.id, byCode.CHM.id],
  });
  await addStaff({
    staffId: "STF-0003",
    firstName: "Nadia",
    lastName: "Khan",
    qualification: "MA English",
    dateOfJoining: new Date(2023, 4, 1),
    contactNumber: "0300-5555555",
    email: "nadia.khan@nccs.edu",
    address: "Islamabad",
    gender: "FEMALE",
    salaryAmount: 45000,
    facultyType: "VISITING",
    subjectIds: [byCode.ENG.id],
  });

  const staffSeq = await db().from("Sequence").insert({ name: "staff", value: 3 });
  if (staffSeq.error) throw staffSeq.error;

  async function addClass(input: {
    code: string;
    name: string;
    programId: string;
    classTeacherId?: string;
    feeAmount: number;
    subjectIds: string[];
  }) {
    const created = await db()
      .from("Class")
      .insert({
        id: newId(),
        code: input.code,
        name: input.name,
        programId: input.programId,
        academicYearId: year.id,
        classTeacherId: input.classTeacherId ?? null,
        feeAmount: input.feeAmount,
        status: "ACTIVE",
        createdAt: stamp,
        updatedAt: stamp,
        createdById: admin.id,
      })
      .select()
      .single();
    if (created.error) throw created.error;
    if (input.subjectIds.length) {
      const links = await db()
        .from("ClassSubject")
        .insert(input.subjectIds.map((subjectId) => ({ classId: created.data.id, subjectId })));
      if (links.error) throw links.error;
    }
    return created.data;
  }

  const grade10Ics = await addClass({
    code: "CLS-0001",
    name: "Grade 10",
    programId: ics.id,
    classTeacherId: teacherSara.id,
    feeAmount: 5000,
    subjectIds: [byCode.CS.id, byCode.PHY.id, byCode.MTH.id, byCode.ENG.id],
  });
  const grade10Fsc = await addClass({
    code: "CLS-0002",
    name: "Grade 10",
    programId: fsc.id,
    classTeacherId: teacherImran.id,
    feeAmount: 5500,
    subjectIds: [byCode.PHY.id, byCode.CHM.id, byCode.MTH.id, byCode.ENG.id],
  });
  const grade9 = await addClass({
    code: "CLS-0003",
    name: "Grade 9",
    programId: fa.id,
    feeAmount: 4000,
    subjectIds: [byCode.ENG.id, byCode.URD.id, byCode.MTH.id],
  });
  await addClass({
    code: "CLS-0004",
    name: "Grade 11",
    programId: icom.id,
    feeAmount: 6000,
    subjectIds: [byCode.ACC.id, byCode.ECO.id, byCode.ENG.id],
  });

  const classSeq = await db().from("Sequence").insert({ name: "class", value: 4 });
  if (classSeq.error) throw classSeq.error;

  const assignments = await db().from("StaffAssignment").insert([
    { id: newId(), staffId: teacherSara.id, classId: grade10Ics.id, subjectId: byCode.CS.id },
    { id: newId(), staffId: teacherImran.id, classId: grade10Fsc.id, subjectId: byCode.PHY.id },
  ]);
  if (assignments.error) throw assignments.error;

  let studentCount = 0;
  async function addStudent(input: {
    firstName: string;
    lastName: string;
    fatherName: string;
    classId: string;
    type: StudentType;
    fee: number;
    gender?: "MALE" | "FEMALE";
    contact: string;
  }) {
    studentCount += 1;
    const created = await db()
      .from("Student")
      .insert({
        id: newId(),
        registrationNo: `STU-2026-${String(studentCount).padStart(4, "0")}`,
        firstName: input.firstName,
        lastName: input.lastName,
        fatherName: input.fatherName,
        classId: input.classId,
        dateOfAdmission: nowIso(new Date(2026, 3, 10)),
        gender: input.gender ?? "MALE",
        contactNumber: input.contact,
        address: "Islamabad",
        studentType: input.type,
        feeAmount: input.fee,
        status: "ACTIVE",
        createdAt: stamp,
        updatedAt: stamp,
        createdById: admin.id,
      })
      .select()
      .single();
    if (created.error) throw created.error;
    await ensureStudentFeeRecord({ studentId: created.data.id, month: 9, year: 2026, userId: admin.id });
    return created.data;
  }

  const ali = await addStudent({
    firstName: "Ali",
    lastName: "Khan",
    fatherName: "Ahmed Khan",
    classId: grade10Ics.id,
    type: "SELF",
    fee: 5000,
    contact: "0311-1000001",
  });
  await addStudent({
    firstName: "Ahmed",
    lastName: "Hassan",
    fatherName: "Tariq Hassan",
    classId: grade10Ics.id,
    type: "SCHOLARSHIP",
    fee: 5000,
    contact: "0311-1000002",
  });
  const hamza = await addStudent({
    firstName: "Hamza",
    lastName: "Ali",
    fatherName: "Nadeem Ali",
    classId: grade10Ics.id,
    type: "NEED_BASED",
    fee: 5000,
    contact: "0311-1000003",
  });
  await addStudent({
    firstName: "Fatima",
    lastName: "Zahra",
    fatherName: "Usman Zahra",
    classId: grade10Ics.id,
    type: "SELF",
    fee: 5000,
    gender: "FEMALE",
    contact: "0311-1000004",
  });
  await addStudent({
    firstName: "Zain",
    lastName: "Raza",
    fatherName: "Bilal Raza",
    classId: grade10Fsc.id,
    type: "SELF",
    fee: 5500,
    contact: "0311-1000005",
  });
  await addStudent({
    firstName: "Ayesha",
    lastName: "Siddiqui",
    fatherName: "Omar Siddiqui",
    classId: grade9.id,
    type: "NEED_BASED",
    fee: 4000,
    gender: "FEMALE",
    contact: "0311-1000006",
  });

  const studentSeq = await db().from("Sequence").insert({ name: "student-2026", value: 6 });
  if (studentSeq.error) throw studentSeq.error;

  await recordStudentPayment({
    studentId: ali.id,
    amount: 5000,
    paymentDate: new Date(2026, 8, 14, 12),
    paymentMethod: "BANK_TRANSFER",
    referenceNumber: "BT-88921",
    notes: "September monthly fee",
    month: 9,
    year: 2026,
    userId: admin.id,
  });

  await recordStudentPayment({
    studentId: hamza.id,
    amount: 3000,
    paymentDate: new Date(2026, 8, 12, 12),
    paymentMethod: "CASH",
    notes: "Partial September fee",
    month: 9,
    year: 2026,
    userId: admin.id,
  });

  await recordIncome({
    date: new Date(2026, 3, 12, 12),
    amount: 10000,
    category: "ADMISSION_FEE",
    source: "New admissions",
    classId: grade10Ics.id,
    paymentMethod: "CASH",
    userId: admin.id,
  });

  await recordExpense({
    date: new Date(2026, 8, 1, 12),
    amount: 120000,
    category: "SALARIES",
    paidTo: "Teaching staff",
    paymentMethod: "BANK_TRANSFER",
    description: "September salaries",
    userId: admin.id,
  });
  await recordExpense({
    date: new Date(2026, 8, 5, 12),
    amount: 18000,
    category: "UTILITIES",
    paidTo: "IESCO",
    paymentMethod: "ONLINE",
    description: "Electricity bill",
    userId: admin.id,
  });
  await recordExpense({
    date: new Date(2026, 8, 3, 12),
    amount: 40000,
    category: "RENT",
    paidTo: "Campus landlord",
    paymentMethod: "BANK_TRANSFER",
    userId: admin.id,
  });

  await recordSalaryPayment({
    staffId: teacherSara.id,
    amount: 45000,
    paymentDate: new Date(2026, 8, 30, 12),
    paymentMethod: "BANK_TRANSFER",
    month: 9,
    year: 2026,
    notes: "September salary, remaining 5,000",
    userId: admin.id,
  });

  console.log("Seed complete. Login as admin@nccs.edu / Admin@123");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
