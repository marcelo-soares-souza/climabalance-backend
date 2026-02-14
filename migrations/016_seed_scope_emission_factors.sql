-- Migration: Seed Scope Emission Factors for Legal Entities
-- Description: Adds passthrough emission factors for Scope 1/2/3 inputs
-- where users enter pre-calculated tCO2e values, and kWh-based factors
-- for Scope 2 purchased energy.
-- Version: 2026-01
-- Region: BR (Brazil)

-- =========================
-- SCOPE 1 - Direct Emissions (passthrough: 1 tCO2e = 1000 kg CO2e)
-- =========================
-- Users enter pre-calculated tCO2e values from their GHG inventory
INSERT INTO emission_factors (id, activity_type, unit, factor_value, factor_unit, source, valid_from, valid_to, region, version, created_at, updated_at, deleted_at) VALUES
('01939d7e-0020-7000-8000-000000000001', 'scope1_stationary_combustion', 'tco2e', 1000.0, 'kg_co2e', 'GHG Protocol Scope 1 - passthrough (user-reported tCO2e)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-0021-7000-8000-000000000001', 'scope1_mobile_combustion', 'tco2e', 1000.0, 'kg_co2e', 'GHG Protocol Scope 1 - passthrough (user-reported tCO2e)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-0022-7000-8000-000000000001', 'scope1_fugitive_emissions', 'tco2e', 1000.0, 'kg_co2e', 'GHG Protocol Scope 1 - passthrough (user-reported tCO2e)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-0023-7000-8000-000000000001', 'scope1_process_emissions', 'tco2e', 1000.0, 'kg_co2e', 'GHG Protocol Scope 1 - passthrough (user-reported tCO2e)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
ON CONFLICT (id) DO NOTHING;

-- =========================
-- SCOPE 2 - Indirect Emissions from Purchased Energy (kWh based)
-- =========================
-- Uses same grid factor as residential energy for electricity
-- Heat and steam use slightly higher factors
INSERT INTO emission_factors (id, activity_type, unit, factor_value, factor_unit, source, valid_from, valid_to, region, version, created_at, updated_at, deleted_at) VALUES
('01939d7e-0024-7000-8000-000000000001', 'scope2_purchased_electricity', 'kwh', 0.0817, 'kg_co2e', 'SEEG Brasil 2024 - National Grid Average (Scope 2)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-0025-7000-8000-000000000001', 'scope2_purchased_heat', 'kwh', 0.2100, 'kg_co2e', 'GHG Protocol Scope 2 - district heating average', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-0026-7000-8000-000000000001', 'scope2_purchased_steam', 'kwh', 0.1700, 'kg_co2e', 'GHG Protocol Scope 2 - industrial steam average', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
ON CONFLICT (id) DO NOTHING;

-- =========================
-- SCOPE 3 - Value Chain Emissions (passthrough: 1 tCO2e = 1000 kg CO2e)
-- =========================
-- Users enter pre-calculated tCO2e values from their supply chain assessments
INSERT INTO emission_factors (id, activity_type, unit, factor_value, factor_unit, source, valid_from, valid_to, region, version, created_at, updated_at, deleted_at) VALUES
('01939d7e-0027-7000-8000-000000000001', 'scope3_business_travel', 'tco2e', 1000.0, 'kg_co2e', 'GHG Protocol Scope 3 - passthrough (user-reported tCO2e)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-0028-7000-8000-000000000001', 'scope3_employee_commuting', 'tco2e', 1000.0, 'kg_co2e', 'GHG Protocol Scope 3 - passthrough (user-reported tCO2e)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-0029-7000-8000-000000000001', 'scope3_purchased_goods', 'tco2e', 1000.0, 'kg_co2e', 'GHG Protocol Scope 3 - passthrough (user-reported tCO2e)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-002a-7000-8000-000000000001', 'scope3_waste', 'tco2e', 1000.0, 'kg_co2e', 'GHG Protocol Scope 3 - passthrough (user-reported tCO2e)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
('01939d7e-002b-7000-8000-000000000001', 'scope3_upstream_transport', 'tco2e', 1000.0, 'kg_co2e', 'GHG Protocol Scope 3 - passthrough (user-reported tCO2e)', '2026-01-01', '2026-12-31', 'BR', '2026-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
ON CONFLICT (id) DO NOTHING;
