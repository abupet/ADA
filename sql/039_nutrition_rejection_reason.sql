-- sql/039_nutrition_rejection_reason.sql
-- Add rejection_reason column to nutrition_plans table

ALTER TABLE nutrition_plans ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
