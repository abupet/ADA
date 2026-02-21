-- sql/036_education.sql
-- B2B Phase 4: Continuing education, courses, ECM credits

CREATE TABLE IF NOT EXISTS education_courses (
    course_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    instructor_user_id TEXT,
    specialty TEXT,
    course_type TEXT NOT NULL DEFAULT 'webinar'
        CHECK (course_type IN ('webinar', 'on_demand', 'live_workshop', 'case_study')),
    duration_minutes INTEGER,
    ecm_credits NUMERIC(4,1) DEFAULT 0,
    max_participants INTEGER,
    scheduled_at TIMESTAMPTZ,
    recording_url TEXT,
    materials_url TEXT,
    thumbnail_url TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'live', 'completed', 'archived')),
    available_for JSONB DEFAULT '["vet_ext"]',
    price NUMERIC(8,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_courses_status ON education_courses(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_courses_specialty ON education_courses(specialty, status);

CREATE TABLE IF NOT EXISTS education_enrollments (
    enrollment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES education_courses(course_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'enrolled'
        CHECK (status IN ('enrolled', 'attended', 'completed', 'cancelled', 'no_show')),
    progress_pct INTEGER DEFAULT 0,
    completed_at TIMESTAMPTZ,
    ecm_credited BOOLEAN DEFAULT false,
    certificate_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON education_enrollments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON education_enrollments(course_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON education_enrollments(course_id, user_id);

CREATE TABLE IF NOT EXISTS ecm_credits (
    credit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    course_id UUID REFERENCES education_courses(course_id),
    credits NUMERIC(4,1) NOT NULL,
    year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    certificate_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecm_user_year ON ecm_credits(user_id, year);
