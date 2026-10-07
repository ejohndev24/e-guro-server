/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
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
