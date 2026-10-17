import type { Database } from "@/lib/supabase/database.types";

export type Role = Database["public"]["Enums"]["Role"];
export type Gender = Database["public"]["Enums"]["Gender"];
export type StudentType = Database["public"]["Enums"]["StudentType"];
export type StudentStatus = Database["public"]["Enums"]["StudentStatus"];
export type EmploymentStatus = Database["public"]["Enums"]["EmploymentStatus"];
export type ClassStatus = Database["public"]["Enums"]["ClassStatus"];
export type FeeStatus = Database["public"]["Enums"]["FeeStatus"];
export type SalaryStatus = Database["public"]["Enums"]["SalaryStatus"];
export type PaymentMethod = Database["public"]["Enums"]["PaymentMethod"];
export type IncomeCategory = Database["public"]["Enums"]["IncomeCategory"];
export type ExpenseCategory = Database["public"]["Enums"]["ExpenseCategory"];
export type FacultyType = Database["public"]["Enums"]["FacultyType"];
