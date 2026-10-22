import { getMetadataStorage } from 'class-validator';

// class-transformer는 @Type() 메타데이터 저장소를 공개 타입으로 내보내지 않는다(런타임 경로만 있음)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { defaultMetadataStorage } = require('class-transformer/cjs/storage') as {
  defaultMetadataStorage: {
    findTypeMetadata(target: unknown, prop: string): { typeFunction?: () => unknown } | undefined;
  };
};

/**
 * class-validator DTO → JSON Schema.
 * AI 도구 입력 스키마를 DTO에서 바로 뽑아, API 검증 규칙과 도구 설명이 어긋나지 않게 한다.
 * 이 프로젝트 DTO가 쓰는 데코레이터만 다룬다(IsString·IsIn·Min·ValidateNested …).
 * 모르는 규칙은 건너뛴다 — 최종 검증은 어차피 API의 ValidationPipe가 한다.
 */
export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  additionalProperties?: boolean;
}

type Ctor = new (...args: unknown[]) => unknown;

interface ValidationMeta {
  propertyName: string;
  name?: string;
  type: string;
  constraints?: unknown[];
  each?: boolean;
}

const PRIMITIVE: Record<string, string> = {
  isString: 'string',
  isUUID: 'string',
  isDateString: 'string',
  isNumber: 'number',
  isInt: 'integer',
  isBoolean: 'boolean',
  isArray: 'array',
};

export function dtoToSchema(target: Ctor, depth = 0): JsonSchema {
  const metas = getMetadataStorage().getTargetValidationMetadatas(
    target,
    '',
    true,
    false,
  ) as unknown as ValidationMeta[];

  const byProp = new Map<string, ValidationMeta[]>();
  for (const m of metas) {
    const list = byProp.get(m.propertyName) ?? [];
    list.push(m);
    byProp.set(m.propertyName, list);
  }

  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [prop, list] of byProp) {
    const optional = list.some((m) => m.type === 'conditionalValidation');
    if (!optional) required.push(prop);
    properties[prop] = propSchema(target, prop, list, depth);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

function propSchema(target: Ctor, prop: string, list: ValidationMeta[], depth: number): JsonSchema {
  const schema: JsonSchema = {};
  const isEach = list.some((m) => m.each);
  const item: JsonSchema = {};
  const put = (k: keyof JsonSchema, v: unknown) => {
    (isEach ? item : schema)[k] = v as never;
  };

  for (const m of list) {
    if (m.type === 'nestedValidation') {
      // @ValidateNested + @Type(() => X) — 하위 DTO를 펼친다(순환 방지 깊이 제한)
      const t = defaultMetadataStorage.findTypeMetadata(target, prop);
      const nested = t?.typeFunction?.() as Ctor | undefined;
      if (nested && depth < 3) {
        const sub = dtoToSchema(nested, depth + 1);
        const designType = Reflect.getMetadata('design:type', target.prototype as object, prop);
        if (designType === Array) {
          schema.type = 'array';
          schema.items = sub;
        } else Object.assign(schema, sub);
      }
      continue;
    }
    if (m.type !== 'customValidation' && m.name == null) continue;
    const name = m.name ?? '';
    const c = m.constraints ?? [];
    if (PRIMITIVE[name]) {
      if (name === 'isArray') schema.type = 'array';
      else put('type', PRIMITIVE[name]);
      if (name === 'isUUID') put('format', 'uuid');
      if (name === 'isDateString') put('format', 'date');
    } else if (name === 'isIn') {
      put('enum', c[0] as unknown[]);
    } else if (name === 'min') {
      put('minimum', c[0]);
    } else if (name === 'max') {
      put('maximum', c[0]);
    } else if (name === 'maxLength') {
      put('maxLength', c[0]);
    } else if (name === 'minLength') {
      put('minLength', c[0]);
    } else if (name === 'arrayMaxSize') {
      schema.maxItems = c[0] as number;
    } else if (name === 'arrayMinSize') {
      schema.minItems = c[0] as number;
    } else if (name === 'matches') {
      const re = c[0];
      if (re instanceof RegExp) put('pattern', re.source);
    }
  }
  if (isEach) {
    schema.type = 'array';
    schema.items = item;
  }
  if (!schema.type && !schema.enum) {
    // 규칙이 IsOptional뿐인 칸 — 선언된 TS 타입으로 추정
    const designType = Reflect.getMetadata('design:type', target.prototype as object, prop);
    if (designType === Number) schema.type = 'number';
    else if (designType === Boolean) schema.type = 'boolean';
    else if (designType === Array) schema.type = 'array';
    else if (designType === String) schema.type = 'string';
  }
  return schema;
}
