// Inputs to the grade calculations: plain data, independent of how it's stored.

export interface GradeCategory {
  id: string;
  name: string;
  /** Share of the final grade, 0-100. Weights need not total 100; they're renormalized. */
  weight: number;
}

export interface GradedItem {
  id: string;
  /** null = uncategorized (only counted when the course has no categories). */
  categoryId: string | null;
  pointsEarned: number | null;
  pointsPossible: number | null;
}

export interface GradeInput {
  categories: readonly GradeCategory[];
  assignments: readonly GradedItem[];
}

export interface CategoryGrade {
  categoryId: string | null;
  /** Percent in this category (can exceed 100 with extra credit), or null if nothing graded. */
  percent: number | null;
  earned: number;
  possible: number;
  gradedCount: number;
  weight: number;
}

export interface CourseGrade {
  /** Weighted percent over categories that have grades, or null if nothing is graded yet. */
  percent: number | null;
  /** Sum of the weights that were counted (the renormalization base). */
  countedWeight: number;
  /** Sum of all category weights. */
  totalWeight: number;
  categories: CategoryGrade[];
}
