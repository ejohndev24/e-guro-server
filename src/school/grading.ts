/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
import { EducationLevel } from '@prisma/client';

export type GradeCategoryResult = {
  name: string;
  percentageScore: number;
  weightedScore: number;
};

export type GradeComputation = {
  initialGrade: number;
  finalGrade: number;
  components: GradeCategoryResult[];
};

type CategoryForComputation = {
  name: string;
  weight: number;
  assessments: Array<{
    maxScore: number;
    scores: Array<{ studentId: string; score?: number }>;
  }>;
};

const roundToTwo = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const usesDepEdTransmutation = (educationLevel?: EducationLevel | null) =>
  educationLevel === EducationLevel.ELEMENTARY
  || educationLevel === EducationLevel.JUNIOR_HIGH
  || educationLevel === EducationLevel.SENIOR_HIGH;

// Appendix B, DepEd Order No. 8, s. 2015. A raw 60 becomes 75; the
// lowest report-card grade is 60. Boundary handling mirrors the table.
export const transmuteDepEdGrade = (initialGrade: number) => {
  const grade = Math.min(100, Math.max(0, initialGrade));
  if (grade >= 100) return 100;
  if (grade >= 60) return Math.min(99, 75 + Math.floor((grade - 60) / 1.6));
  return 60 + Math.floor(grade / 4);
};

export const computeStudentGrade = (
  studentId: string,
  categories: CategoryForComputation[],
  educationLevel?: EducationLevel | null,
): GradeComputation | undefined => {
  if (!categories.length) return undefined;

  let initialGrade = 0;
  const components: GradeCategoryResult[] = [];

  for (const category of categories) {
    if (!category.assessments.length) return undefined;

    let earned = 0;
    let possible = 0;
    for (const assessment of category.assessments) {
      const score = assessment.scores.find((entry) => entry.studentId === studentId)?.score;
      if (score === undefined) return undefined;
      earned += score;
      possible += assessment.maxScore;
    }
    if (possible <= 0) return undefined;

    const percentageScore = (earned / possible) * 100;
    const weightedScore = percentageScore * (category.weight / 100);
    initialGrade += weightedScore;
    components.push({
      name: category.name,
      percentageScore: roundToTwo(percentageScore),
      weightedScore: roundToTwo(weightedScore),
    });
  }

  const roundedInitial = roundToTwo(initialGrade);
  return {
    initialGrade: roundedInitial,
    finalGrade: usesDepEdTransmutation(educationLevel)
      ? transmuteDepEdGrade(roundedInitial)
      : roundedInitial,
    components,
  };
};
