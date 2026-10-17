export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      AcademicYear: {
        Row: {
          createdAt: string
          createdById: string | null
          endDate: string
          id: string
          isActive: boolean
          name: string
          startDate: string
          updatedAt: string
          updatedById: string | null
        }
        Insert: {
          createdAt?: string
          createdById?: string | null
          endDate: string
          id: string
          isActive?: boolean
          name: string
          startDate: string
          updatedAt: string
          updatedById?: string | null
        }
        Update: {
          createdAt?: string
          createdById?: string | null
          endDate?: string
          id?: string
          isActive?: boolean
          name?: string
          startDate?: string
          updatedAt?: string
          updatedById?: string | null
        }
        Relationships: []
      }
      AuditLog: {
        Row: {
          action: string
          createdAt: string
          details: string | null
          entityId: string | null
          entityType: string
          id: string
          userId: string | null
        }
        Insert: {
          action: string
          createdAt?: string
          details?: string | null
          entityId?: string | null
          entityType: string
          id: string
          userId?: string | null
        }
        Update: {
          action?: string
          createdAt?: string
          details?: string | null
          entityId?: string | null
          entityType?: string
          id?: string
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "AuditLog_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      Class: {
        Row: {
          academicYearId: string
          classTeacherId: string | null
          code: string
          createdAt: string
          createdById: string | null
          feeAmount: number
          id: string
          name: string
          programId: string
          status: Database["public"]["Enums"]["ClassStatus"]
          updatedAt: string
          updatedById: string | null
        }
        Insert: {
          academicYearId: string
          classTeacherId?: string | null
          code: string
          createdAt?: string
          createdById?: string | null
          feeAmount: number
          id: string
          name: string
          programId: string
          status?: Database["public"]["Enums"]["ClassStatus"]
          updatedAt: string
          updatedById?: string | null
        }
        Update: {
          academicYearId?: string
          classTeacherId?: string | null
          code?: string
          createdAt?: string
          createdById?: string | null
          feeAmount?: number
          id?: string
          name?: string
          programId?: string
          status?: Database["public"]["Enums"]["ClassStatus"]
          updatedAt?: string
          updatedById?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Class_academicYearId_fkey"
            columns: ["academicYearId"]
            isOneToOne: false
            referencedRelation: "AcademicYear"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Class_classTeacherId_fkey"
            columns: ["classTeacherId"]
            isOneToOne: false
            referencedRelation: "Staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Class_programId_fkey"
            columns: ["programId"]
            isOneToOne: false
            referencedRelation: "Program"
            referencedColumns: ["id"]
          },
        ]
      }
      ClassSubject: {
        Row: {
          classId: string
          subjectId: string
        }
        Insert: {
          classId: string
          subjectId: string
        }
        Update: {
          classId?: string
          subjectId?: string
        }
        Relationships: [
          {
            foreignKeyName: "ClassSubject_classId_fkey"
            columns: ["classId"]
            isOneToOne: false
            referencedRelation: "Class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ClassSubject_subjectId_fkey"
            columns: ["subjectId"]
            isOneToOne: false
            referencedRelation: "Subject"
            referencedColumns: ["id"]
          },
        ]
      }
      ExpenseTransaction: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["ExpenseCategory"]
          createdAt: string
          createdById: string | null
          date: string
          description: string | null
          expenseId: string
          id: string
          notes: string | null
          paidTo: string
          paymentMethod: Database["public"]["Enums"]["PaymentMethod"]
          referenceNumber: string | null
          updatedAt: string
          updatedById: string | null
          voidedAt: string | null
          voidedById: string | null
          voidReason: string | null
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["ExpenseCategory"]
          createdAt?: string
          createdById?: string | null
          date: string
          description?: string | null
          expenseId: string
          id: string
          notes?: string | null
          paidTo: string
          paymentMethod: Database["public"]["Enums"]["PaymentMethod"]
          referenceNumber?: string | null
          updatedAt: string
          updatedById?: string | null
          voidedAt?: string | null
          voidedById?: string | null
          voidReason?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["ExpenseCategory"]
          createdAt?: string
          createdById?: string | null
          date?: string
          description?: string | null
          expenseId?: string
          id?: string
          notes?: string | null
          paidTo?: string
          paymentMethod?: Database["public"]["Enums"]["PaymentMethod"]
          referenceNumber?: string | null
          updatedAt?: string
          updatedById?: string | null
          voidedAt?: string | null
          voidedById?: string | null
          voidReason?: string | null
        }
        Relationships: []
      }
      FeePayment: {
        Row: {
          amount: number
          createdAt: string
          createdById: string | null
          feeRecordId: string
          id: string
          incomeTransactionId: string
          notes: string | null
          paymentDate: string
          paymentMethod: Database["public"]["Enums"]["PaymentMethod"]
          referenceNumber: string | null
          studentId: string
          updatedAt: string
          updatedById: string | null
          voidedAt: string | null
          voidedById: string | null
          voidReason: string | null
        }
        Insert: {
          amount: number
          createdAt?: string
          createdById?: string | null
          feeRecordId: string
          id: string
          incomeTransactionId: string
          notes?: string | null
          paymentDate: string
          paymentMethod: Database["public"]["Enums"]["PaymentMethod"]
          referenceNumber?: string | null
          studentId: string
          updatedAt: string
          updatedById?: string | null
          voidedAt?: string | null
          voidedById?: string | null
          voidReason?: string | null
        }
        Update: {
          amount?: number
          createdAt?: string
          createdById?: string | null
          feeRecordId?: string
          id?: string
          incomeTransactionId?: string
          notes?: string | null
          paymentDate?: string
          paymentMethod?: Database["public"]["Enums"]["PaymentMethod"]
          referenceNumber?: string | null
          studentId?: string
          updatedAt?: string
          updatedById?: string | null
          voidedAt?: string | null
          voidedById?: string | null
          voidReason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "FeePayment_feeRecordId_fkey"
            columns: ["feeRecordId"]
            isOneToOne: false
            referencedRelation: "FeeRecord"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "FeePayment_incomeTransactionId_fkey"
            columns: ["incomeTransactionId"]
            isOneToOne: true
            referencedRelation: "IncomeTransaction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "FeePayment_studentId_fkey"
            columns: ["studentId"]
            isOneToOne: false
            referencedRelation: "Student"
            referencedColumns: ["id"]
          },
        ]
      }
      FeeRecord: {
        Row: {
          academicYearId: string
          classId: string
          createdAt: string
          createdById: string | null
          dueDate: string
          expectedAmount: number
          fineAmount: number
          id: string
          month: number
          paidAmount: number
          remainingAmount: number
          status: Database["public"]["Enums"]["FeeStatus"]
          studentId: string
          updatedAt: string
          updatedById: string | null
          waivedAmount: number
          year: number
        }
        Insert: {
          academicYearId: string
          classId: string
          createdAt?: string
          createdById?: string | null
          dueDate: string
          expectedAmount: number
          fineAmount?: number
          id: string
          month: number
          paidAmount?: number
          remainingAmount: number
          status?: Database["public"]["Enums"]["FeeStatus"]
          studentId: string
          updatedAt: string
          updatedById?: string | null
          waivedAmount?: number
          year: number
        }
        Update: {
          academicYearId?: string
          classId?: string
          createdAt?: string
          createdById?: string | null
          dueDate?: string
          expectedAmount?: number
          fineAmount?: number
          id?: string
          month?: number
          paidAmount?: number
          remainingAmount?: number
          status?: Database["public"]["Enums"]["FeeStatus"]
          studentId?: string
          updatedAt?: string
          updatedById?: string | null
          waivedAmount?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "FeeRecord_academicYearId_fkey"
            columns: ["academicYearId"]
            isOneToOne: false
            referencedRelation: "AcademicYear"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "FeeRecord_classId_fkey"
            columns: ["classId"]
            isOneToOne: false
            referencedRelation: "Class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "FeeRecord_studentId_fkey"
            columns: ["studentId"]
            isOneToOne: false
            referencedRelation: "Student"
            referencedColumns: ["id"]
          },
        ]
      }
      IncomeTransaction: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["IncomeCategory"]
          classId: string | null
          createdAt: string
          createdById: string | null
          date: string
          id: string
          incomeId: string
          notes: string | null
          paymentMethod: Database["public"]["Enums"]["PaymentMethod"]
          referenceNumber: string | null
          source: string | null
          studentId: string | null
          updatedAt: string
          updatedById: string | null
          voidedAt: string | null
          voidedById: string | null
          voidReason: string | null
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["IncomeCategory"]
          classId?: string | null
          createdAt?: string
          createdById?: string | null
          date: string
          id: string
          incomeId: string
          notes?: string | null
          paymentMethod: Database["public"]["Enums"]["PaymentMethod"]
          referenceNumber?: string | null
          source?: string | null
          studentId?: string | null
          updatedAt: string
          updatedById?: string | null
          voidedAt?: string | null
          voidedById?: string | null
          voidReason?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["IncomeCategory"]
          classId?: string | null
          createdAt?: string
          createdById?: string | null
          date?: string
          id?: string
          incomeId?: string
          notes?: string | null
          paymentMethod?: Database["public"]["Enums"]["PaymentMethod"]
          referenceNumber?: string | null
          source?: string | null
          studentId?: string | null
          updatedAt?: string
          updatedById?: string | null
          voidedAt?: string | null
          voidedById?: string | null
          voidReason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "IncomeTransaction_classId_fkey"
            columns: ["classId"]
            isOneToOne: false
            referencedRelation: "Class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "IncomeTransaction_studentId_fkey"
            columns: ["studentId"]
            isOneToOne: false
            referencedRelation: "Student"
            referencedColumns: ["id"]
          },
        ]
      }
      Program: {
        Row: {
          createdAt: string
          createdById: string | null
          description: string | null
          id: string
          name: string
          status: string
          updatedAt: string
          updatedById: string | null
        }
        Insert: {
          createdAt?: string
          createdById?: string | null
          description?: string | null
          id: string
          name: string
          status?: string
          updatedAt: string
          updatedById?: string | null
        }
        Update: {
          createdAt?: string
          createdById?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          updatedAt?: string
          updatedById?: string | null
        }
        Relationships: []
      }
      SalaryPayment: {
        Row: {
          amount: number
          createdAt: string
          createdById: string | null
          expenseTransactionId: string
          id: string
          notes: string | null
          paymentDate: string
          paymentMethod: Database["public"]["Enums"]["PaymentMethod"]
          referenceNumber: string | null
          salaryRecordId: string
          staffId: string
          updatedAt: string
          updatedById: string | null
          voidedAt: string | null
          voidedById: string | null
          voidReason: string | null
        }
        Insert: {
          amount: number
          createdAt?: string
          createdById?: string | null
          expenseTransactionId: string
          id: string
          notes?: string | null
          paymentDate: string
          paymentMethod: Database["public"]["Enums"]["PaymentMethod"]
          referenceNumber?: string | null
          salaryRecordId: string
          staffId: string
          updatedAt: string
          updatedById?: string | null
          voidedAt?: string | null
          voidedById?: string | null
          voidReason?: string | null
        }
        Update: {
          amount?: number
          createdAt?: string
          createdById?: string | null
          expenseTransactionId?: string
          id?: string
          notes?: string | null
          paymentDate?: string
          paymentMethod?: Database["public"]["Enums"]["PaymentMethod"]
          referenceNumber?: string | null
          salaryRecordId?: string
          staffId?: string
          updatedAt?: string
          updatedById?: string | null
          voidedAt?: string | null
          voidedById?: string | null
          voidReason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "SalaryPayment_expenseTransactionId_fkey"
            columns: ["expenseTransactionId"]
            isOneToOne: true
            referencedRelation: "ExpenseTransaction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "SalaryPayment_salaryRecordId_fkey"
            columns: ["salaryRecordId"]
            isOneToOne: false
            referencedRelation: "SalaryRecord"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "SalaryPayment_staffId_fkey"
            columns: ["staffId"]
            isOneToOne: false
            referencedRelation: "Staff"
            referencedColumns: ["id"]
          },
        ]
      }
      SalaryRecord: {
        Row: {
          createdAt: string
          createdById: string | null
          expectedAmount: number
          id: string
          month: number
          paidAmount: number
          remainingAmount: number
          staffId: string
          status: Database["public"]["Enums"]["SalaryStatus"]
          updatedAt: string
          updatedById: string | null
          year: number
        }
        Insert: {
          createdAt?: string
          createdById?: string | null
          expectedAmount: number
          id: string
          month: number
          paidAmount?: number
          remainingAmount: number
          staffId: string
          status?: Database["public"]["Enums"]["SalaryStatus"]
          updatedAt: string
          updatedById?: string | null
          year: number
        }
        Update: {
          createdAt?: string
          createdById?: string | null
          expectedAmount?: number
          id?: string
          month?: number
          paidAmount?: number
          remainingAmount?: number
          staffId?: string
          status?: Database["public"]["Enums"]["SalaryStatus"]
          updatedAt?: string
          updatedById?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "SalaryRecord_staffId_fkey"
            columns: ["staffId"]
            isOneToOne: false
            referencedRelation: "Staff"
            referencedColumns: ["id"]
          },
        ]
      }
      Sequence: {
        Row: {
          name: string
          value: number
        }
        Insert: {
          name: string
          value: number
        }
        Update: {
          name?: string
          value?: number
        }
        Relationships: []
      }
      Setting: {
        Row: {
          id: string
          key: string
          value: string
        }
        Insert: {
          id: string
          key: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      Staff: {
        Row: {
          address: string
          contactNumber: string
          createdAt: string
          createdById: string | null
          dateOfJoining: string
          email: string | null
          emergencyContact: string | null
          employmentStatus: Database["public"]["Enums"]["EmploymentStatus"]
          facultyType: Database["public"]["Enums"]["FacultyType"]
          firstName: string
          gender: Database["public"]["Enums"]["Gender"]
          id: string
          lastName: string
          qualification: string
          salaryAmount: number
          staffId: string
          updatedAt: string
          updatedById: string | null
        }
        Insert: {
          address: string
          contactNumber: string
          createdAt?: string
          createdById?: string | null
          dateOfJoining: string
          email?: string | null
          emergencyContact?: string | null
          employmentStatus?: Database["public"]["Enums"]["EmploymentStatus"]
          facultyType?: Database["public"]["Enums"]["FacultyType"]
          firstName: string
          gender: Database["public"]["Enums"]["Gender"]
          id: string
          lastName: string
          qualification: string
          salaryAmount?: number
          staffId: string
          updatedAt: string
          updatedById?: string | null
        }
        Update: {
          address?: string
          contactNumber?: string
          createdAt?: string
          createdById?: string | null
          dateOfJoining?: string
          email?: string | null
          emergencyContact?: string | null
          employmentStatus?: Database["public"]["Enums"]["EmploymentStatus"]
          facultyType?: Database["public"]["Enums"]["FacultyType"]
          firstName?: string
          gender?: Database["public"]["Enums"]["Gender"]
          id?: string
          lastName?: string
          qualification?: string
          salaryAmount?: number
          staffId?: string
          updatedAt?: string
          updatedById?: string | null
        }
        Relationships: []
      }
      StaffAssignment: {
        Row: {
          classId: string
          createdAt: string
          id: string
          staffId: string
          subjectId: string | null
        }
        Insert: {
          classId: string
          createdAt?: string
          id: string
          staffId: string
          subjectId?: string | null
        }
        Update: {
          classId?: string
          createdAt?: string
          id?: string
          staffId?: string
          subjectId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "StaffAssignment_classId_fkey"
            columns: ["classId"]
            isOneToOne: false
            referencedRelation: "Class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "StaffAssignment_staffId_fkey"
            columns: ["staffId"]
            isOneToOne: false
            referencedRelation: "Staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "StaffAssignment_subjectId_fkey"
            columns: ["subjectId"]
            isOneToOne: false
            referencedRelation: "Subject"
            referencedColumns: ["id"]
          },
        ]
      }
      StaffSubject: {
        Row: {
          staffId: string
          subjectId: string
        }
        Insert: {
          staffId: string
          subjectId: string
        }
        Update: {
          staffId?: string
          subjectId?: string
        }
        Relationships: [
          {
            foreignKeyName: "StaffSubject_staffId_fkey"
            columns: ["staffId"]
            isOneToOne: false
            referencedRelation: "Staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "StaffSubject_subjectId_fkey"
            columns: ["subjectId"]
            isOneToOne: false
            referencedRelation: "Subject"
            referencedColumns: ["id"]
          },
        ]
      }
      Student: {
        Row: {
          address: string
          classId: string
          contactNumber: string
          createdAt: string
          createdById: string | null
          dateOfAdmission: string
          deletedAt: string | null
          email: string | null
          fatherName: string
          feeAmount: number
          firstName: string
          gender: Database["public"]["Enums"]["Gender"]
          id: string
          lastName: string
          registrationNo: string
          status: Database["public"]["Enums"]["StudentStatus"]
          studentType: Database["public"]["Enums"]["StudentType"]
          updatedAt: string
          updatedById: string | null
        }
        Insert: {
          address: string
          classId: string
          contactNumber: string
          createdAt?: string
          createdById?: string | null
          dateOfAdmission: string
          deletedAt?: string | null
          email?: string | null
          fatherName: string
          feeAmount: number
          firstName: string
          gender: Database["public"]["Enums"]["Gender"]
          id: string
          lastName: string
          registrationNo: string
          status?: Database["public"]["Enums"]["StudentStatus"]
          studentType: Database["public"]["Enums"]["StudentType"]
          updatedAt: string
          updatedById?: string | null
        }
        Update: {
          address?: string
          classId?: string
          contactNumber?: string
          createdAt?: string
          createdById?: string | null
          dateOfAdmission?: string
          deletedAt?: string | null
          email?: string | null
          fatherName?: string
          feeAmount?: number
          firstName?: string
          gender?: Database["public"]["Enums"]["Gender"]
          id?: string
          lastName?: string
          registrationNo?: string
          status?: Database["public"]["Enums"]["StudentStatus"]
          studentType?: Database["public"]["Enums"]["StudentType"]
          updatedAt?: string
          updatedById?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Student_classId_fkey"
            columns: ["classId"]
            isOneToOne: false
            referencedRelation: "Class"
            referencedColumns: ["id"]
          },
        ]
      }
      Subject: {
        Row: {
          code: string
          createdAt: string
          createdById: string | null
          id: string
          name: string
          updatedAt: string
          updatedById: string | null
        }
        Insert: {
          code: string
          createdAt?: string
          createdById?: string | null
          id: string
          name: string
          updatedAt: string
          updatedById?: string | null
        }
        Update: {
          code?: string
          createdAt?: string
          createdById?: string | null
          id?: string
          name?: string
          updatedAt?: string
          updatedById?: string | null
        }
        Relationships: []
      }
      User: {
        Row: {
          createdAt: string
          createdById: string | null
          email: string
          id: string
          isActive: boolean
          name: string
          passwordHash: string
          role: Database["public"]["Enums"]["Role"]
          updatedAt: string
          updatedById: string | null
        }
        Insert: {
          createdAt?: string
          createdById?: string | null
          email: string
          id: string
          isActive?: boolean
          name: string
          passwordHash: string
          role?: Database["public"]["Enums"]["Role"]
          updatedAt: string
          updatedById?: string | null
        }
        Update: {
          createdAt?: string
          createdById?: string | null
          email?: string
          id?: string
          isActive?: boolean
          name?: string
          passwordHash?: string
          role?: Database["public"]["Enums"]["Role"]
          updatedAt?: string
          updatedById?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      ClassStatus: "ACTIVE" | "INACTIVE"
      EmploymentStatus: "ACTIVE" | "ON_LEAVE" | "RESIGNED" | "TERMINATED"
      ExpenseCategory:
        | "SALARIES"
        | "UTILITIES"
        | "RENT"
        | "MAINTENANCE"
        | "SUPPLIES"
        | "TRANSPORT"
        | "OTHER_EXPENSES"
      FacultyType: "PERMANENT" | "VISITING"
      FeeStatus: "PAID" | "PARTIALLY_PAID" | "PENDING" | "OVERDUE" | "WAIVED"
      Gender: "MALE" | "FEMALE" | "OTHER"
      IncomeCategory:
        | "STUDENT_FEE"
        | "ADMISSION_FEE"
        | "REGISTRATION_FEE"
        | "TRANSPORT_FEE"
        | "OTHER_INCOME"
      PaymentMethod: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "ONLINE" | "OTHER"
      Role: "ADMIN" | "PRINCIPAL" | "ACCOUNTANT"
      SalaryStatus: "PAID" | "PARTIALLY_PAID" | "PENDING"
      StudentStatus: "ACTIVE" | "INACTIVE" | "GRADUATED" | "SUSPENDED"
      StudentType: "SELF" | "SCHOLARSHIP" | "NEED_BASED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ClassStatus: ["ACTIVE", "INACTIVE"],
      EmploymentStatus: ["ACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED"],
      ExpenseCategory: [
        "SALARIES",
        "UTILITIES",
        "RENT",
        "MAINTENANCE",
        "SUPPLIES",
        "TRANSPORT",
        "OTHER_EXPENSES",
      ],
      FacultyType: ["PERMANENT", "VISITING"],
      FeeStatus: ["PAID", "PARTIALLY_PAID", "PENDING", "OVERDUE", "WAIVED"],
      Gender: ["MALE", "FEMALE", "OTHER"],
      IncomeCategory: [
        "STUDENT_FEE",
        "ADMISSION_FEE",
        "REGISTRATION_FEE",
        "TRANSPORT_FEE",
        "OTHER_INCOME",
      ],
      PaymentMethod: ["CASH", "BANK_TRANSFER", "CHEQUE", "ONLINE", "OTHER"],
      Role: ["ADMIN", "PRINCIPAL", "ACCOUNTANT"],
      SalaryStatus: ["PAID", "PARTIALLY_PAID", "PENDING"],
      StudentStatus: ["ACTIVE", "INACTIVE", "GRADUATED", "SUSPENDED"],
      StudentType: ["SELF", "SCHOLARSHIP", "NEED_BASED"],
    },
  },
} as const
