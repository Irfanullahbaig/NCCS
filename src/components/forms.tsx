"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import { createClass, createProgram, createSubject, deleteClass, deleteSubject, updateClass, updateSubject } from "@/actions/classes";
import { createExpenseAction, createIncomeAction, recordPaymentAction, voidExpenseAction, voidIncomeAction } from "@/actions/finance";
import { recordSalaryPaymentAction, updateSalaryPaymentAction, voidSalaryPaymentAction } from "@/actions/salary";
import { createStaff, updateStaff } from "@/actions/staff";
import { createStudent, deleteStudent, updateStudent } from "@/actions/students";
import { createUserAction } from "@/actions/users";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import {
  EMPLOYMENT_LABELS,
  EXPENSE_CATEGORY_LABELS,
  GENDER_LABELS,
  INCOME_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  STUDENT_STATUS_LABELS,
  STUDENT_TYPE_LABELS,
} from "@/lib/constants";

function Checklist({
  name,
  options,
  defaultValue = [],
  empty = "None available yet.",
}: {
  name: string;
  options: Array<{ id: string; label: string }>;
  defaultValue?: string[];
  empty?: string;
}) {
  if (!options.length) {
    return <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">{empty}</p>;
  }
  return (
    <div className="grid max-h-44 gap-2 overflow-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
      {options.map((option) => (
        <label key={option.id} className="flex items-center gap-2 text-sm text-navy">
          <input
            type="checkbox"
            name={name}
            value={option.id}
            defaultChecked={defaultValue.includes(option.id)}
            className="h-4 w-4 rounded border-slate-300 text-teal focus:ring-teal"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/50 p-4 sm:items-center">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-navy">{title}</h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">
            Close
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function useSubmit() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(
    action: (formData: FormData) => Promise<{ ok: true } | { ok: false; error: string }>,
    formData: FormData,
    success: string,
    onSuccess?: () => void,
  ) {
    setPending(true);
    setError(null);
    const result = await action(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success(success);
    onSuccess?.();
    router.refresh();
  }

  return { error, pending, submit, setError };
}

type ClassOption = { id: string; name: string; program: string; feeAmount: number };
type SubjectOption = { id: string; name: string };
type StudentOption = {
  id: string;
  name: string;
  classId: string;
  remaining?: number;
  fatherName?: string;
  registrationNo?: string;
  classLabel?: string;
};

function studentSearchText(student: StudentOption) {
  return [student.name, student.fatherName, student.registrationNo, student.classLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function StudentSearchField({
  students,
  value,
  onChange,
  required,
  placeholder = "Search by name, father, registration no, or class...",
}: {
  students: StudentOption[];
  value: string;
  onChange: (student: StudentOption | null) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const selected = students.find((student) => student.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && selected) setQuery(selected.name);
  }, [value, selected]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = term.length
      ? students.filter((student) => studentSearchText(student).includes(term))
      : students;
    return list.slice(0, 8);
  }, [students, query]);

  return (
    <div ref={box} className="relative">
      <input type="hidden" name="studentId" value={value} required={required} />
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <Input
        value={query}
        autoComplete="off"
        placeholder={placeholder}
        className="pl-9 pr-9"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (selected && event.target.value !== selected.name) onChange(null);
        }}
      />
      {value ? (
        <button
          type="button"
          className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          onClick={() => {
            onChange(null);
            setQuery("");
            setOpen(true);
          }}
          aria-label="Clear student"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
      {open ? (
        <div className="mt-1 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-sm">
          {matches.length ? (
            matches.map((student) => (
              <button
                type="button"
                key={student.id}
                className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => {
                  onChange(student);
                  setQuery(student.name);
                  setOpen(false);
                }}
              >
                <p className="text-sm font-medium text-navy">{student.name}</p>
                <p className="text-xs text-slate-500">
                  {[student.registrationNo, student.classLabel, student.fatherName ? `Father: ${student.fatherName}` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-slate-500">No matching students</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function StudentForm({
  open,
  onClose,
  classes,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  classes: ClassOption[];
  initial?: {
    id: string;
    registrationNo: string;
    firstName: string;
    lastName: string;
    fatherName: string;
    classId: string;
    dateOfAdmission: string;
    gender: string;
    contactNumber: string;
    email?: string | null;
    address: string;
    studentType: string;
    feeAmount: number;
    status: string;
  };
}) {
  const { error, pending, submit } = useSubmit();
  const [classId, setClassId] = useState(initial?.classId ?? "");
  const selected = useMemo(() => classes.find((item) => item.id === classId), [classes, classId]);

  useEffect(() => {
    setClassId(initial?.classId ?? "");
  }, [initial, open]);

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit student" : "Add student"}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(initial ? updateStudent : createStudent, new FormData(event.currentTarget), initial ? "Student updated" : "Student added", onClose);
        }}
      >
        {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
        <Field label="Registration number">
          <Input name="registrationNo" defaultValue={initial?.registrationNo} placeholder="Auto-generated if empty" />
        </Field>
        <Field label="Student type">
          <Select name="studentType" defaultValue={initial?.studentType ?? "SELF"} required>
            {Object.entries(STUDENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="First name">
          <Input name="firstName" defaultValue={initial?.firstName} required />
        </Field>
        <Field label="Last name">
          <Input name="lastName" defaultValue={initial?.lastName} required />
        </Field>
        <Field label="Father's name" className="sm:col-span-2">
          <Input name="fatherName" defaultValue={initial?.fatherName} required />
        </Field>
        <Field label="Class / program">
          <Select
            name="classId"
            required
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
          >
            <option value="">Select class</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.program}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date of admission">
          <Input type="date" name="dateOfAdmission" defaultValue={initial?.dateOfAdmission} required />
        </Field>
        <Field label="Gender">
          <Select name="gender" defaultValue={initial?.gender ?? "MALE"} required>
            {Object.entries(GENDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Contact number">
          <Input name="contactNumber" defaultValue={initial?.contactNumber} required />
        </Field>
        <Field label="Email">
          <Input type="email" name="email" defaultValue={initial?.email ?? ""} />
        </Field>
        <Field label="Monthly fee">
          <Input
            type="number"
            min="0"
            name="feeAmount"
            defaultValue={initial?.feeAmount ?? selected?.feeAmount ?? 0}
            key={`${initial?.id ?? "new"}-${selected?.id ?? "none"}-${open}`}
            required
          />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={initial?.status ?? "ACTIVE"}>
            {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea name="address" defaultValue={initial?.address} required />
        </Field>
        <div className="sm:col-span-2 space-y-3">
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save student"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function StaffForm({
  open,
  onClose,
  subjects,
  classes,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  subjects: SubjectOption[];
  classes: ClassOption[];
  initial?: {
    id: string;
    staffId: string;
    firstName: string;
    lastName: string;
    qualification: string;
    dateOfJoining: string;
    contactNumber: string;
    emergencyContact?: string | null;
    email?: string | null;
    address: string;
    gender: string;
    employmentStatus: string;
    subjectIds: string[];
    classIds: string[];
    salaryAmount: number;
  };
}) {
  const { error, pending, submit } = useSubmit();
  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit staff" : "Add staff / teacher"}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(initial ? updateStaff : createStaff, new FormData(event.currentTarget), initial ? "Staff updated" : "Staff added", onClose);
        }}
      >
        {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
        <Field label="Staff ID">
          <Input name="staffId" defaultValue={initial?.staffId} placeholder="Auto-generated if empty" />
        </Field>
        <Field label="Employment status">
          <Select name="employmentStatus" defaultValue={initial?.employmentStatus ?? "ACTIVE"}>
            {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="First name"><Input name="firstName" defaultValue={initial?.firstName} required /></Field>
        <Field label="Last name"><Input name="lastName" defaultValue={initial?.lastName} required /></Field>
        <Field label="Qualification" className="sm:col-span-2">
          <Input name="qualification" defaultValue={initial?.qualification} required />
        </Field>
        <Field label="Date of joining"><Input type="date" name="dateOfJoining" defaultValue={initial?.dateOfJoining} required /></Field>
        <Field label="Gender">
          <Select name="gender" defaultValue={initial?.gender ?? "MALE"} required>
            {Object.entries(GENDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Contact number"><Input name="contactNumber" defaultValue={initial?.contactNumber} required /></Field>
        <Field label="Emergency contact"><Input name="emergencyContact" defaultValue={initial?.emergencyContact ?? ""} /></Field>
        <Field label="Email"><Input type="email" name="email" defaultValue={initial?.email ?? ""} /></Field>
        <Field label="Monthly salary (PKR)">
          <Input type="number" min="0" name="salaryAmount" defaultValue={initial?.salaryAmount ?? 0} required />
        </Field>
        <Field label="Assigned classes" className="sm:col-span-2">
          <Checklist
            name="classIds"
            defaultValue={initial?.classIds ?? []}
            empty="Create classes first, then assign them here."
            options={classes.map((item) => ({ id: item.id, label: `${item.name} — ${item.program}` }))}
          />
        </Field>
        <Field label="Assigned subjects" className="sm:col-span-2">
          <Checklist
            name="subjectIds"
            defaultValue={initial?.subjectIds ?? []}
            empty="Create subjects first, then assign them here."
            options={subjects.map((subject) => ({ id: subject.id, label: subject.name }))}
          />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea name="address" defaultValue={initial?.address} required />
        </Field>
        <div className="sm:col-span-2 space-y-3">
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save staff"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function ClassForm({
  open,
  onClose,
  programs,
  years,
  teachers,
  subjects,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  programs: Array<{ id: string; name: string }>;
  years: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; name: string }>;
  subjects: SubjectOption[];
  initial?: {
    id: string;
    name: string;
    programId: string;
    academicYearId: string;
    classTeacherId?: string | null;
    feeAmount: number;
    status: string;
    subjectIds: string[];
  };
}) {
  const { error, pending, submit } = useSubmit();
  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit class" : "Create class / program section"}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(initial ? updateClass : createClass, new FormData(event.currentTarget), initial ? "Class updated" : "Class created", onClose);
        }}
      >
        {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
        <Field label="Class / grade name"><Input name="name" defaultValue={initial?.name} placeholder="Grade 10" required /></Field>
        <Field label="Program / group">
          <Select name="programId" defaultValue={initial?.programId} required>
            <option value="">Select program</option>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
          </Select>
        </Field>
        <Field label="Academic year">
          <Select name="academicYearId" defaultValue={initial?.academicYearId} required>
            <option value="">Select year</option>
            {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </Select>
        </Field>
        <Field label="Class teacher">
          <Select name="classTeacherId" defaultValue={initial?.classTeacherId ?? ""}>
            <option value="">Unassigned</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </Select>
        </Field>
        <Field label="Fee amount"><Input type="number" min="0" name="feeAmount" defaultValue={initial?.feeAmount ?? 0} required /></Field>
        <Field label="Status">
          <Select name="status" defaultValue={initial?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </Field>
        <Field label="Subjects" className="sm:col-span-2">
          <Checklist
            name="subjectIds"
            defaultValue={initial?.subjectIds ?? []}
            empty="Add subjects first, then attach them to this class."
            options={subjects.map((subject) => ({ id: subject.id, label: subject.name }))}
          />
        </Field>
        <div className="sm:col-span-2 space-y-3">
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save class"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function ProgramForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { error, pending, submit } = useSubmit();
  return (
    <Modal open={open} onClose={onClose} title="Add program">
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(createProgram, new FormData(event.currentTarget), "Program created", onClose);
        }}
      >
        <Field label="Program name"><Input name="name" placeholder="ICS" required /></Field>
        <Field label="Description"><Textarea name="description" /></Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save program"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function SubjectForm({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: { id: string; name: string; code: string };
}) {
  const { error, pending, submit } = useSubmit();
  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit subject" : "Add subject"}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(initial ? updateSubject : createSubject, new FormData(event.currentTarget), initial ? "Subject updated" : "Subject created", onClose);
        }}
      >
        {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
        <Field label="Subject name"><Input name="name" defaultValue={initial?.name} required /></Field>
        <Field label="Code"><Input name="code" placeholder="CS" defaultValue={initial?.code} required /></Field>
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save subject"}</Button>
        </div>
        <ErrorText>{error}</ErrorText>
      </form>
    </Modal>
  );
}

export function IncomeForm({
  open,
  onClose,
  students,
  classes,
}: {
  open: boolean;
  onClose: () => void;
  students: StudentOption[];
  classes: ClassOption[];
}) {
  const { error, pending, submit } = useSubmit();
  const [category, setCategory] = useState("STUDENT_FEE");
  const [studentId, setStudentId] = useState("");
  const [classId, setClassId] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!open) return;
    setCategory("STUDENT_FEE");
    setStudentId("");
    setClassId("");
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Add income">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (category === "STUDENT_FEE" && !studentId) {
            toast.error("Search and select a student for this fee");
            return;
          }
          await submit(createIncomeAction, new FormData(event.currentTarget), "Income recorded", onClose);
        }}
      >
        <Field label="Date"><Input type="date" name="date" defaultValue={today} required /></Field>
        <Field label="Amount"><Input type="number" min="1" name="amount" required /></Field>
        <Field label="Income category">
          <Select name="category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {Object.entries(INCOME_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Source"><Input name="source" placeholder="Student fee, donation, etc." /></Field>
        <Field label="Student" className="sm:col-span-2">
          <StudentSearchField
            students={students}
            value={studentId}
            required={category === "STUDENT_FEE"}
            onChange={(student) => {
              setStudentId(student?.id ?? "");
              if (student?.classId) setClassId(student.classId);
            }}
          />
          {category === "STUDENT_FEE" ? (
            <p className="mt-1.5 text-xs text-slate-500">Search and select the student to attach this fee payment.</p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">Optional unless this income is a student fee.</p>
          )}
        </Field>
        <Field label="Class">
          <Select name="classId" value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Optional</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>{item.name} — {item.program}</option>
            ))}
          </Select>
        </Field>
        <Field label="Payment method">
          <Select name="paymentMethod" required>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reference number"><Input name="referenceNumber" /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" /></Field>
        <div className="sm:col-span-2 space-y-3">
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save income"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function ExpenseForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { error, pending, submit } = useSubmit();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Modal open={open} onClose={onClose} title="Add expense">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(createExpenseAction, new FormData(event.currentTarget), "Expense recorded", onClose);
        }}
      >
        <Field label="Date"><Input type="date" name="date" defaultValue={today} required /></Field>
        <Field label="Amount"><Input type="number" min="1" name="amount" required /></Field>
        <Field label="Category">
          <Select name="category" required>
            {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Paid to"><Input name="paidTo" required /></Field>
        <Field label="Payment method">
          <Select name="paymentMethod" required>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reference number"><Input name="referenceNumber" /></Field>
        <Field label="Description" className="sm:col-span-2"><Input name="description" /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" /></Field>
        <div className="sm:col-span-2 space-y-3">
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save expense"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function PaymentForm({
  open,
  onClose,
  students,
  presetStudentId,
}: {
  open: boolean;
  onClose: () => void;
  students: StudentOption[];
  presetStudentId?: string;
}) {
  const { error, pending, submit } = useSubmit();
  const today = new Date().toISOString().slice(0, 10);
  const [studentId, setStudentId] = useState(presetStudentId ?? "");
  const selected = students.find((student) => student.id === studentId);

  useEffect(() => {
    setStudentId(presetStudentId ?? "");
  }, [presetStudentId, open]);

  return (
    <Modal open={open} onClose={onClose} title="Record fee payment">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(recordPaymentAction, new FormData(event.currentTarget), "Payment recorded", onClose);
        }}
      >
        <Field label="Student" className="sm:col-span-2">
          <StudentSearchField
            students={students}
            value={studentId}
            required
            onChange={(student) => setStudentId(student?.id ?? "")}
          />
        </Field>
        <Field label="Amount">
          <Input type="number" min="1" name="amount" defaultValue={selected?.remaining ?? ""} required />
        </Field>
        <Field label="Payment date"><Input type="date" name="paymentDate" defaultValue={today} required /></Field>
        <Field label="Payment method">
          <Select name="paymentMethod" required>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reference number"><Input name="referenceNumber" /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" /></Field>
        <div className="sm:col-span-2 space-y-3">
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Record payment"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function UserForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { error, pending, submit } = useSubmit();
  return (
    <Modal open={open} onClose={onClose} title="Add user">
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(createUserAction, new FormData(event.currentTarget), "User created", onClose);
        }}
      >
        <Field label="Full name"><Input name="name" required /></Field>
        <Field label="Email"><Input type="email" name="email" required /></Field>
        <Field label="Role">
          <Select name="role" required>
            <option value="ADMIN">Admin</option>
            <option value="PRINCIPAL">Principal</option>
            <option value="ACCOUNTANT">Accountant / HR</option>
          </Select>
        </Field>
        <Field label="Password"><Input type="password" name="password" minLength={8} required /></Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>Create user</Button>
        </div>
      </form>
    </Modal>
  );
}

export function AddStudentButton({ classes }: { classes: ClassOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add student</Button>
      <StudentForm open={open} onClose={() => setOpen(false)} classes={classes} />
    </>
  );
}

export function AddStaffButton({ subjects, classes }: { subjects: SubjectOption[]; classes: ClassOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add staff</Button>
      <StaffForm open={open} onClose={() => setOpen(false)} subjects={subjects} classes={classes} />
    </>
  );
}

export function AddClassButtons(props: {
  programs: Array<{ id: string; name: string }>;
  years: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; name: string }>;
  subjects: SubjectOption[];
}) {
  const [classOpen, setClassOpen] = useState(false);
  const [programOpen, setProgramOpen] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setSubjectOpen(true)}>Add subject</Button>
      <Button variant="outline" onClick={() => setProgramOpen(true)}>Add program</Button>
      <Button onClick={() => setClassOpen(true)}>Create class</Button>
      <ClassForm open={classOpen} onClose={() => setClassOpen(false)} {...props} />
      <ProgramForm open={programOpen} onClose={() => setProgramOpen(false)} />
      <SubjectForm open={subjectOpen} onClose={() => setSubjectOpen(false)} />
    </>
  );
}

export function AddIncomeButton({ students, classes }: { students: StudentOption[]; classes: ClassOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add income</Button>
      <IncomeForm open={open} onClose={() => setOpen(false)} students={students} classes={classes} />
    </>
  );
}

export function AddExpenseButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add expense</Button>
      <ExpenseForm open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function RecordPaymentButton({ students, presetStudentId, label = "Record payment" }: { students: StudentOption[]; presetStudentId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <PaymentForm open={open} onClose={() => setOpen(false)} students={students} presetStudentId={presetStudentId} />
    </>
  );
}

export function AddUserButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add user</Button>
      <UserForm open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function EditStudentButton({ classes, initial }: { classes: ClassOption[]; initial: NonNullable<Parameters<typeof StudentForm>[0]["initial"]> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Edit</Button>
      <StudentForm open={open} onClose={() => setOpen(false)} classes={classes} initial={initial} />
    </>
  );
}

export function EditStaffButton(props: { subjects: SubjectOption[]; classes: ClassOption[]; initial: NonNullable<Parameters<typeof StaffForm>[0]["initial"]> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Edit</Button>
      <StaffForm open={open} onClose={() => setOpen(false)} {...props} />
    </>
  );
}

export function EditClassButton({
  programs,
  years,
  teachers,
  subjects,
  initial,
}: {
  programs: Array<{ id: string; name: string }>;
  years: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; name: string }>;
  subjects: SubjectOption[];
  initial: {
    id: string;
    name: string;
    programId: string;
    academicYearId: string;
    classTeacherId?: string | null;
    feeAmount: number;
    status: string;
    subjectIds: string[];
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Edit</Button>
      <ClassForm
        open={open}
        onClose={() => setOpen(false)}
        programs={programs}
        years={years}
        teachers={teachers}
        subjects={subjects}
        initial={initial}
      />
    </>
  );
}

export function DeleteStudentButton({ id, name }: { id: string; name: string }) {
  const { pending, submit } = useSubmit();
  return (
    <Button
      size="sm"
      variant="danger"
      disabled={pending}
      onClick={async () => {
        if (!confirm(`Remove ${name} from the active student list?`)) return;
        const formData = new FormData();
        formData.set("id", id);
        await submit(deleteStudent, formData, "Student removed");
      }}
    >
      Remove
    </Button>
  );
}

export function VoidButton({
  id,
  type,
}: {
  id: string;
  type: "income" | "expense";
}) {
  const { pending, submit } = useSubmit();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        const reason = prompt("Void reason") || "";
        if (!reason) return;
        const formData = new FormData();
        formData.set("id", id);
        formData.set("reason", reason);
        await submit(type === "income" ? voidIncomeAction : voidExpenseAction, formData, "Transaction voided");
      }}
    >
      Void
    </Button>
  );
}

export function EditSubjectButton({ initial }: { initial: { id: string; name: string; code: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Edit</Button>
      <SubjectForm open={open} onClose={() => setOpen(false)} initial={initial} />
    </>
  );
}

export function DeleteSubjectButton({ id, name }: { id: string; name: string }) {
  const { pending, submit } = useSubmit();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        if (!confirm(`Delete subject ${name}? It will be removed from classes and teachers.`)) return;
        const formData = new FormData();
        formData.set("id", id);
        await submit(deleteSubject, formData, "Subject deleted");
      }}
    >
      Delete
    </Button>
  );
}

export function DeleteClassButton({ id, name }: { id: string; name: string }) {
  const { pending, submit } = useSubmit();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        if (!confirm(`Delete ${name}? This cannot be undone if the class has no students or fee history.`)) return;
        const formData = new FormData();
        formData.set("id", id);
        await submit(deleteClass, formData, "Class deleted");
      }}
    >
      Delete
    </Button>
  );
}

type SalaryTeacherOption = {
  id: string;
  name: string;
  salaryAmount: number;
  remaining?: number;
};

export function SalaryPaymentForm({
  open,
  onClose,
  teachers,
  presetStaffId,
  defaultMonth,
  defaultYear,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  teachers: SalaryTeacherOption[];
  presetStaffId?: string;
  defaultMonth: number;
  defaultYear: number;
  initial?: {
    paymentId: string;
    staffId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    referenceNumber?: string | null;
    notes?: string | null;
  };
}) {
  const { error, pending, submit } = useSubmit();
  const today = new Date().toISOString().slice(0, 10);
  const [staffId, setStaffId] = useState(initial?.staffId ?? presetStaffId ?? "");
  const selected = teachers.find((teacher) => teacher.id === staffId);

  useEffect(() => {
    setStaffId(initial?.staffId ?? presetStaffId ?? "");
  }, [initial, presetStaffId, open]);

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit salary payment" : "Record salary payment"}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(
            initial ? updateSalaryPaymentAction : recordSalaryPaymentAction,
            new FormData(event.currentTarget),
            initial ? "Salary payment updated" : "Salary payment recorded",
            onClose,
          );
        }}
      >
        {initial ? <input type="hidden" name="paymentId" value={initial.paymentId} /> : null}
        <input type="hidden" name="staffId" value={staffId} />
        <Field label="Teacher" className="sm:col-span-2">
          <Select value={staffId} onChange={(event) => setStaffId(event.target.value)} required disabled={Boolean(initial)}>
            <option value="">Select teacher</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
            ))}
          </Select>
        </Field>
        {selected ? (
          <p className="sm:col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Assigned salary: <strong className="text-navy">Rs. {selected.salaryAmount.toLocaleString("en-PK")}</strong>
            {typeof selected.remaining === "number" ? (
              <> · Remaining: <strong className="text-navy">Rs. {selected.remaining.toLocaleString("en-PK")}</strong></>
            ) : null}
          </p>
        ) : null}
        {initial ? null : (
          <>
            <Field label="Salary month">
              <Select name="month" defaultValue={String(defaultMonth)} required>
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {new Date(2000, index, 1).toLocaleString("en-US", { month: "long" })}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Year">
              <Input type="number" name="year" min="2000" defaultValue={defaultYear} required />
            </Field>
          </>
        )}
        <Field label="Amount paid">
          <Input type="number" min="1" name="amount" defaultValue={initial?.amount ?? selected?.remaining ?? ""} required />
        </Field>
        <Field label="Payment date">
          <Input type="date" name="paymentDate" defaultValue={initial?.paymentDate ?? today} required />
        </Field>
        <Field label="Payment method">
          <Select name="paymentMethod" defaultValue={initial?.paymentMethod} required>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reference number"><Input name="referenceNumber" defaultValue={initial?.referenceNumber ?? ""} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={initial?.notes ?? ""} /></Field>
        <div className="sm:col-span-2 space-y-3">
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : initial ? "Save payment" : "Record payment"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function RecordSalaryButton({
  teachers,
  defaultMonth,
  defaultYear,
  presetStaffId,
  label = "Record salary",
}: {
  teachers: SalaryTeacherOption[];
  defaultMonth: number;
  defaultYear: number;
  presetStaffId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <SalaryPaymentForm
        open={open}
        onClose={() => setOpen(false)}
        teachers={teachers}
        defaultMonth={defaultMonth}
        defaultYear={defaultYear}
        presetStaffId={presetStaffId}
      />
    </>
  );
}

export function EditSalaryPaymentButton({
  teachers,
  defaultMonth,
  defaultYear,
  initial,
}: {
  teachers: SalaryTeacherOption[];
  defaultMonth: number;
  defaultYear: number;
  initial: NonNullable<Parameters<typeof SalaryPaymentForm>[0]["initial"]>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Edit</Button>
      <SalaryPaymentForm
        open={open}
        onClose={() => setOpen(false)}
        teachers={teachers}
        defaultMonth={defaultMonth}
        defaultYear={defaultYear}
        initial={initial}
      />
    </>
  );
}

export function VoidSalaryButton({ id, staffId }: { id: string; staffId: string }) {
  const { pending, submit } = useSubmit();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        const reason = prompt("Void reason") || "";
        if (!reason) return;
        const formData = new FormData();
        formData.set("id", id);
        formData.set("staffId", staffId);
        formData.set("reason", reason);
        await submit(voidSalaryPaymentAction, formData, "Salary payment voided");
      }}
    >
      Void
    </Button>
  );
}
