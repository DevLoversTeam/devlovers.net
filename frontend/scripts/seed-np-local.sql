-- UTF-8 safe seed for local NP catalog testing (Shop shipping).
-- ASCII-only file: Cyrillic values are injected via hex->UTF8.
SET client_encoding = 'UTF8';

-- Cities
INSERT INTO np_cities (
  ref,
  name_ua,
  name_ru,
  area,
  region,
  settlement_type,
  is_active,
  created_at,
  updated_at
)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    convert_from(decode('d09ad0b8d197d0b220d09bd0bed0bad0b0d0bbd18cd0bdd0b8d0b920d0a2d0b5d181d182','hex'),'UTF8'),
    convert_from(decode('d09ad0b8d0b5d0b220d09bd0bed0bad0b0d0bbd18cd0bdd18bd0b920d0a2d0b5d181d182','hex'),'UTF8'),
    convert_from(decode('d09ad0b8d197d0b2d181d18cd0bad0b0','hex'),'UTF8'),
    convert_from(decode('d09ad0b8d197d0b2','hex'),'UTF8'),
    convert_from(decode('d09cd196d181d182d0be','hex'),'UTF8'),
    true,
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    convert_from(decode('d09bd18cd0b2d196d0b220d09bd0bed0bad0b0d0bbd18cd0bdd0b8d0b920d0a2d0b5d181d182','hex'),'UTF8'),
    convert_from(decode('d09bd18cd0b2d0bed0b220d09bd0bed0bad0b0d0bbd18cd0bdd18bd0b920d0a2d0b5d181d182','hex'),'UTF8'),
    convert_from(decode('d09bd18cd0b2d196d0b2d181d18cd0bad0b0','hex'),'UTF8'),
    convert_from(decode('d09bd18cd0b2d196d0b2','hex'),'UTF8'),
    convert_from(decode('d09cd196d181d182d0be','hex'),'UTF8'),
    true,
    now(),
    now()
  )
ON CONFLICT (ref) DO UPDATE
SET
  name_ua = EXCLUDED.name_ua,
  name_ru = EXCLUDED.name_ru,
  area = EXCLUDED.area,
  region = EXCLUDED.region,
  settlement_type = EXCLUDED.settlement_type,
  is_active = true,
  updated_at = now();

-- Warehouses
INSERT INTO np_warehouses (
  ref,
  city_ref,
  settlement_ref,
  number,
  type,
  name,
  name_ru,
  address,
  address_ru,
  is_post_machine,
  is_active,
  created_at,
  updated_at
)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'NP-CITY-KYIV',
    '11111111-1111-4111-8111-111111111111',
    '12',
    'Warehouse',
    convert_from(decode('d092d196d0b4d0b4d196d0bbd0b5d0bdd0bdd18f2031322028d09bd0bed0bad0b0d0bbd18cd0bdd0b8d0b920d0a2d0b5d181d18229','hex'),'UTF8'),
    convert_from(decode('d09ed182d0b4d0b5d0bbd0b5d0bdd0b8d0b52031322028d09bd0bed0bad0b0d0bbd18cd0bdd18bd0b920d0a2d0b5d181d18229','hex'),'UTF8'),
    convert_from(decode('d09ad0b8d197d0b22c20d0b2d183d0bb2e20d0a2d0b5d181d182d0bed0b2d0b02c203132','hex'),'UTF8'),
    convert_from(decode('d09ad0b8d0b5d0b22c20d183d0bb2e20d0a2d0b5d181d182d0bed0b2d0b0d18f2c203132','hex'),'UTF8'),
    false,
    true,
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'NP-CITY-LVIV',
    '22222222-2222-4222-8222-222222222222',
    '7',
    'Postomat',
    convert_from(decode('d09fd0bed188d182d0bed0bcd0b0d18220372028d09bd0bed0bad0b0d0bbd18cd0bdd0b8d0b920d0a2d0b5d181d18229','hex'),'UTF8'),
    convert_from(decode('d09fd0bed187d182d0bed0bcd0b0d18220372028d09bd0bed0bad0b0d0bbd18cd0bdd18bd0b920d0a2d0b5d181d18229','hex'),'UTF8'),
    convert_from(decode('d09bd18cd0b2d196d0b22c20d0bfd180d0bed181d0bf2e20d0a2d0b5d181d182d0bed0b2d0b8d0b92c2037','hex'),'UTF8'),
    convert_from(decode('d09bd18cd0b2d0bed0b22c20d0bfd180d0bed181d0bf2e20d0a2d0b5d181d182d0bed0b2d18bd0b92c2037','hex'),'UTF8'),
    true,
    true,
    now(),
    now()
  )
ON CONFLICT (ref) DO UPDATE
SET
  city_ref = EXCLUDED.city_ref,
  settlement_ref = EXCLUDED.settlement_ref,
  number = EXCLUDED.number,
  type = EXCLUDED.type,
  name = EXCLUDED.name,
  name_ru = EXCLUDED.name_ru,
  address = EXCLUDED.address,
  address_ru = EXCLUDED.address_ru,
  is_post_machine = EXCLUDED.is_post_machine,
  is_active = true,
  updated_at = now();