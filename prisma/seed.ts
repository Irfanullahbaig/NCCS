import { PrismaClient, type StudentType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureStudentFeeRecord, recordExpense, recordIncome, recordStudentPayment } from "../src/lib/finance";
import { recordSalaryPayment } from "../src/lib/salary";

const prisma = new PrismaClient();

async function main() {
  await prisma.feePayment.deleteMany();
  await prisma.salaryPayment.deleteMany();
  await prisma.salaryRecord.deleteMany();
  await prisma.incomeTransaction.deleteMany();
  await prisma.expenseTransaction.deleteMany();
  await prisma.feeRecord.deleteMany();
  await prisma.student.deleteMany();
  await prisma.staffAssignment.deleteMany();
  await prisma.staffSubject.deleteMany();
  await prisma.classSubject.deleteMany();
  await prisma.class.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.program.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.sequence.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      name: "System Admin",
      email: "admin@nccs.edu",
      passwordHash: await bcrypt.hash("Admin@123", 12),
      role: "ADMIN",
    },
  });
  await prisma.user.create({
    data: {
      name: "College Principal",
      email: "principal@nccs.edu",
      passwordHash: await bcrypt.hash("Principal@123", 12),
      role: "PRINCIPAL",
    },
  });
  await prisma.user.create({
    data: {
      name: "Finance Accountant",
      email: "accountant@nccs.edu",
      passwordHash: await bcrypt.hash("Accountant@123", 12),
      role: "ACCOUNTANT",
    },
  });

  await prisma.setting.createMany({
    data: [
      { key: "schoolName", value: "NCCS" },
      { key: "schoolAddress", value: "Main Campus, Islamabad" },
      { key: "schoolPhone", value: "051-0000000" },
      { key: "currencyPrefix", value: "Rs." },
    ],
  });

  const year = await prisma.academicYear.create({
    data: {
      name: "2026-2027",
      startDate: new Date(2026, 3, 1),
      endDate: new Date(2027, 2, 31),
      isActive: true,
      createdById: admin.id,
    },
  });

  const [ics, fa, fsc, icom] = await Promise.all(
    ["ICS", "FA", "FSC", "ICOM"].map((name) =>
      prisma.program.create({ data: { name, createdById: admin.id } }),
    ),
  );

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
    subjectData.map(([code, name]) => prisma.subject.create({ data: { code, name, createdById: admin.id } })),
  );
  const byCode = Object.fromEntries(subjects.map((subject) => [subject.code, subject]));

  const teacherSara = await prisma.staff.create({
    data: {
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
      employmentStatus: "ACTIVE",
      salaryAmount: 50000,
      createdById: admin.id,
      subjects: { create: [{ subjectId: byCode.CS.id }, { subjectId: byCode.MTH.id }] },
    },
  });
  const teacherImran = await prisma.staff.create({
    data: {
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
      employmentStatus: "ACTIVE",
      salaryAmount: 60000,
      createdById: admin.id,
      subjects: { create: [{ subjectId: byCode.PHY.id }, { subjectId: byCode.CHM.id }] },
    },
  });
  await prisma.staff.create({
    data: {
      staffId: "STF-0003",
      firstName: "Nadia",
      lastName: "Khan",
      qualification: "MA English",
      dateOfJoining: new Date(2023, 4, 1),
      contactNumber: "0300-5555555",
      email: "nadia.khan@nccs.edu",
      address: "Islamabad",
      gender: "FEMALE",
      employmentStatus: "ACTIVE",
      salaryAmount: 45000,
      createdById: admin.id,
      subjects: { create: [{ subjectId: byCode.ENG.id }] },
    },
  });

  await prisma.sequence.create({ data: { name: "staff", value: 3 } });

  const grade10Ics = await prisma.class.create({
    data: {
      code: "CLS-0001",
      name: "Grade 10",
      programId: ics.id,
      academicYearId: year.id,
      classTeacherId: teacherSara.id,
      feeAmount: 5000,
      status: "ACTIVE",
      createdById: admin.id,
      subjects: {
        create: [byCode.CS, byCode.PHY, byCode.MTH, byCode.ENG].map((subject) => ({ subjectId: subject.id })),
      },
    },
  });
  const grade10Fsc = await prisma.class.create({
    data: {
      code: "CLS-0002",
      name: "Grade 10",
      programId: fsc.id,
      academicYearId: year.id,
      classTeacherId: teacherImran.id,
      feeAmount: 5500,
      status: "ACTIVE",
      createdById: admin.id,
      subjects: {
        create: [byCode.PHY, byCode.CHM, byCode.MTH, byCode.ENG].map((subject) => ({ subjectId: subject.id })),
      },
    },
  });
  const grade9 = await prisma.class.create({
    data: {
      code: "CLS-0003",
      name: "Grade 9",
      programId: fa.id,
      academicYearId: year.id,
      feeAmount: 4000,
      status: "ACTIVE",
      createdById: admin.id,
      subjects: {
        create: [byCode.ENG, byCode.URD, byCode.MTH].map((subject) => ({ subjectId: subject.id })),
      },
    },
  });
  await prisma.class.create({
    data: {
      code: "CLS-0004",
      name: "Grade 11",
      programId: icom.id,
      academicYearId: year.id,
      feeAmount: 6000,
      status: "ACTIVE",
      createdById: admin.id,
      subjects: {
        create: [byCode.ACC, byCode.ECO, byCode.ENG].map((subject) => ({ subjectId: subject.id })),
      },
    },
  });
  await prisma.sequence.create({ data: { name: "class", value: 4 } });

  await prisma.staffAssignment.createMany({
    data: [
      { staffId: teacherSara.id, classId: grade10Ics.id, subjectId: byCode.CS.id },
      { staffId: teacherImran.id, classId: grade10Fsc.id, subjectId: byCode.PHY.id },
    ],
  });

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
    const count = await prisma.student.count();
    const student = await prisma.student.create({
      data: {
        registrationNo: `STU-2026-${String(count + 1).padStart(4, "0")}`,
        firstName: input.firstName,
        lastName: input.lastName,
        fatherName: input.fatherName,
        classId: input.classId,
        dateOfAdmission: new Date(2026, 3, 10),
        gender: input.gender ?? "MALE",
        contactNumber: input.contact,
        address: "Islamabad",
        studentType: input.type,
        feeAmount: input.fee,
        status: "ACTIVE",
        createdById: admin.id,
      },
    });
    await ensureStudentFeeRecord({ studentId: student.id, month: 9, year: 2026, userId: admin.id });
    return student;
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

  await prisma.sequence.create({ data: { name: "student-2026", value: 6 } });

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

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
