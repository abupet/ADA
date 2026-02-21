-- sql/037_marketplace.sql
-- B2B Phase 4: Marketplace orders, subscriptions

CREATE TABLE IF NOT EXISTS marketplace_products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'service'
        CHECK (category IN ('service', 'package', 'nutrition', 'insurance', 'subscription', 'course')),
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    price_breeder NUMERIC(10,2),
    price_vet_ext NUMERIC(10,2),
    recurring BOOLEAN DEFAULT false,
    recurring_interval TEXT CHECK (recurring_interval IN (NULL, 'monthly', 'quarterly', 'yearly')),
    available_for JSONB DEFAULT '["owner","breeder","vet_ext"]',
    linked_service_id UUID,
    linked_course_id UUID,
    thumbnail_url TEXT,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mp_products_cat ON marketplace_products(category, enabled);

CREATE TABLE IF NOT EXISTS marketplace_orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    user_role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'processing', 'completed', 'cancelled', 'refunded')),
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    final_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_method TEXT,
    payment_reference TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mp_orders_user ON marketplace_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_order_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES marketplace_orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES marketplace_products(product_id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL,
    total_price NUMERIC(10,2) NOT NULL,
    pet_id UUID REFERENCES pets(pet_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mp_items_order ON marketplace_order_items(order_id);

CREATE TABLE IF NOT EXISTS marketplace_subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    product_id UUID NOT NULL REFERENCES marketplace_products(product_id),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_billing_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mp_subs_user ON marketplace_subscriptions(user_id, status);
