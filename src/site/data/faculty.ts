export type FacultyMember = {
  id: string;
  name: string;
  role: string;
  department: string;
  image: string;
  alt: string;
};

/**
 * Add a person only when NCCS confirms the name, role, and photograph.
 * Example:
 * {
 *   id: "principal",
 *   name: "",
 *   role: "Principal",
 *   department: "Leadership",
 *   image: "/site/images/faculty/principal.jpg",
 *   alt: "Portrait of the principal of NCCS",
 * }
 */
export const faculty: FacultyMember[] = [];
