-- Migration: Seed Emission Factors
-- Description: Populates emission_factors table with baseline factors for Brazil
-- Version: 2026-01
-- Region: BR (Brazil)
-- Sources: GHG Protocol, IPCC, SEEG Brasil
-- Approach: Hybrid (international standards + local adjustments)

-- Note: UUIDs below are placeholder examples. In production, these should be
-- generated using UUIDv7 by the application layer. For seeding purposes,
-- we use sequential UUIDs that are valid.

-- =========================
-- ENERGY (Residential and Commercial)
-- =========================
-- Source: SEEG Brasil 2024 - National Grid Average
-- Brazil's electricity grid has lower carbon intensity due to high hydroelectric share
INSERT INTO emission_factors (id, activity_type, unit, factor_value, factor_unit, source, valid_from, valid_to, region, version, created_at, updated_at, deleted_at) VALUES
('01939d7e-0001-7000-8000-000000000001', 'energy_residential', 'kwh', 0.0817, 'kg_co2e', 'SEEG Brasil 2024 - National Grid Average', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
ON CONFLICT (id) DO NOTHING;

-- =========================
-- FUELS (Mobile Combustion)
-- =========================
-- Source: GHG Protocol Mobile Combustion Guide
-- Values are for complete combustion including upstream emissions
INSERT INTO emission_factors (id, activity_type, unit, factor_value, factor_unit, source, valid_from, valid_to, region, version, created_at, updated_at, deleted_at) VALUES
('01939d7e-0002-7000-8000-000000000001', 'fuel_gasoline', 'liter', 2.31, 'kg_co2e', 'GHG Protocol Mobile Combustion', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-0003-7000-8000-000000000001', 'fuel_ethanol', 'liter', 1.19, 'kg_co2e', 'GHG Protocol Mobile Combustion', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-0004-7000-8000-000000000001', 'fuel_diesel', 'liter', 2.68, 'kg_co2e', 'GHG Protocol Mobile Combustion', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
ON CONFLICT (id) DO NOTHING;

-- =========================
-- TRANSPORT (Terrestrial - per km per passenger)
-- =========================
-- Source: IPCC Transport Guidelines + Brazil adjustments
-- Assumes average occupancy for each modal
INSERT INTO emission_factors (id, activity_type, unit, factor_value, factor_unit, source, valid_from, valid_to, region, version, created_at, updated_at, deleted_at) VALUES
-- Cars by size (average occupancy: 1.5 passengers)
('01939d7e-0005-7000-8000-000000000001', 'transport_car_small', 'km', 0.104, 'kg_co2e', 'IPCC + BR adjustment (small car, 1.5 avg occupancy)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-0006-7000-8000-000000000001', 'transport_car_medium', 'km', 0.143, 'kg_co2e', 'IPCC + BR adjustment (medium car, 1.5 avg occupancy)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-0007-7000-8000-000000000001', 'transport_car_large', 'km', 0.209, 'kg_co2e', 'IPCC + BR adjustment (large car/SUV, 1.5 avg occupancy)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
-- Motorcycle
('01939d7e-0008-7000-8000-000000000001', 'transport_motorcycle', 'km', 0.084, 'kg_co2e', 'IPCC + BR adjustment (motorcycle)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
-- Public transport
('01939d7e-0009-7000-8000-000000000001', 'transport_bus', 'km', 0.089, 'kg_co2e', 'IPCC + BR adjustment (urban bus, avg occupancy)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-000a-7000-8000-000000000001', 'transport_metro', 'km', 0.028, 'kg_co2e', 'IPCC + BR adjustment (electric metro/subway)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-000b-7000-8000-000000000001', 'transport_train', 'km', 0.041, 'kg_co2e', 'IPCC + BR adjustment (diesel train)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
ON CONFLICT (id) DO NOTHING;

-- =========================
-- FLIGHTS (Aviation - per km per passenger)
-- =========================
-- Source: IPCC Aviation Guidelines
-- Includes direct emissions + radiative forcing (RFI factor ~2.0 for high altitude)
INSERT INTO emission_factors (id, activity_type, unit, factor_value, factor_unit, source, valid_from, valid_to, region, version, created_at, updated_at, deleted_at) VALUES
-- Domestic flights (< 1500 km)
('01939d7e-000c-7000-8000-000000000001', 'flight_domestic_economy', 'km', 0.133, 'kg_co2e', 'IPCC Aviation (domestic short-haul, economy)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-000d-7000-8000-000000000001', 'flight_domestic_business', 'km', 0.199, 'kg_co2e', 'IPCC Aviation (domestic short-haul, business)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
-- International flights (> 1500 km, better fuel efficiency per km)
('01939d7e-000e-7000-8000-000000000001', 'flight_international_economy', 'km', 0.115, 'kg_co2e', 'IPCC Aviation (international long-haul, economy)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-000f-7000-8000-000000000001', 'flight_international_business', 'km', 0.230, 'kg_co2e', 'IPCC Aviation (international long-haul, business)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-0010-7000-8000-000000000001', 'flight_international_first', 'km', 0.345, 'kg_co2e', 'IPCC Aviation (international long-haul, first class)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
ON CONFLICT (id) DO NOTHING;

-- =========================
-- LEGAL ENTITY - Scope 3 (Value Chain)
-- =========================
-- Source: GHG Protocol Scope 3 Guidelines
INSERT INTO emission_factors (id, activity_type, unit, factor_value, factor_unit, source, valid_from, valid_to, region, version, created_at, updated_at, deleted_at) VALUES
-- Freight transport (per tonne-km, assuming average load)
('01939d7e-0011-7000-8000-000000000001', 'freight_truck', 'km', 0.062, 'kg_co2e', 'GHG Protocol Scope 3 (per tonne-km, avg load)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
-- Employee commute (single occupancy car, more conservative than carpooling)
('01939d7e-0012-7000-8000-000000000001', 'employee_commute_car', 'km', 0.171, 'kg_co2e', 'GHG Protocol Scope 3 (avg car, single occupancy)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
ON CONFLICT (id) DO NOTHING;

-- =========================
-- Notes on Emission Factors
-- =========================
-- 1. All factors are CO2 equivalent (CO2e), including CH4 and N2O converted to CO2 using GWP100
-- 2. Factors include both direct (Scope 1) and indirect (Scope 2/3) emissions where applicable
-- 3. For electricity, the factor represents the national grid average; regional factors can be added later
-- 4. For flights, radiative forcing index (RFI) is included to account for high-altitude effects
-- 5. Transport factors assume average vehicle efficiency and occupancy for Brazil
-- 6. Factors are valid for calendar year 2026; new versions should be created annually
-- 7. For legal entities, Scope 1 uses the same fuel factors as individual; Scope 2 uses energy factors
