-- Bring existing independent-teacher workspaces onto the standard
-- Grades 1-10 Languages/AP/EsP DepEd preset. Other subject-group presets
-- can be assigned explicitly from the school portal.
UPDATE "GradeCategory" AS category
SET "weight" = 50
FROM "GradingScheme" AS scheme, "School" AS school
WHERE category."schemeId" = scheme."id"
  AND scheme."schoolId" = school."id"
  AND school."isPersonal" = true
  AND scheme."name" = 'Default Grading'
  AND category."name" = 'Performance Tasks';

UPDATE "GradeCategory" AS category
SET "weight" = 20
FROM "GradingScheme" AS scheme, "School" AS school
WHERE category."schemeId" = scheme."id"
  AND scheme."schoolId" = school."id"
  AND school."isPersonal" = true
  AND scheme."name" = 'Default Grading'
  AND category."name" = 'Quarterly Assessment';

UPDATE "GradingScheme" AS scheme
SET "name" = 'DepEd G1-10 Languages / AP / EsP',
    "educationLevel" = 'ELEMENTARY'
FROM "School" AS school
WHERE scheme."schoolId" = school."id"
  AND school."isPersonal" = true
  AND scheme."name" = 'Default Grading';
