-- Keep subject-period attendance separate from the adviser-confirmed daily record.
CREATE TYPE "AttendanceScope" AS ENUM ('SUBJECT', 'DAILY');

ALTER TABLE "Classroom"
ADD COLUMN "educationLevel" "EducationLevel" NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN "isAdvisory" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Classroom" AS c
SET "educationLevel" = g."educationLevel"
FROM "GradingScheme" AS g
WHERE c."gradingSchemeId" = g."id";

ALTER TABLE "Attendance"
ADD COLUMN "scope" "AttendanceScope" NOT NULL DEFAULT 'SUBJECT';

DROP INDEX "Attendance_studentId_classroomId_date_key";
DROP INDEX "Attendance_classroomId_date_idx";

CREATE UNIQUE INDEX "Attendance_studentId_classroomId_date_scope_key"
ON "Attendance"("studentId", "classroomId", "date", "scope");

CREATE INDEX "Attendance_classroomId_date_scope_idx"
ON "Attendance"("classroomId", "date", "scope");
