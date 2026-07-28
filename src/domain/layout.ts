export type WarehouseZoneType =
  | 'receiving'
  | 'shipping'
  | 'storage'
  | 'picking'
  | 'staging'
  | 'quarantine'
  | 'blocked'

export interface LayoutPoint {
  x: number
  z: number
}

export interface WarehouseZone {
  id: string
  name: string
  type: WarehouseZoneType
  origin: LayoutPoint
  width: number
  depth: number
}

export interface RackRowLayout {
  id: string
  aisle: string
  baysPerSide: number
  levels: number
  pickingLevels: number[]
  origin: LayoutPoint
  rotationY: number
  aisleWidth: number
  bayWidth: number
  rackDepth: number
  levelHeight: number
  active: boolean
}

export interface WarehouseLayout {
  id: string
  name: string
  version: number
  status: 'draft' | 'active' | 'archived'
  createdAt: string
  updatedAt: string
  floor: {
    width: number
    depth: number
  }
  rackRows: RackRowLayout[]
  zones: WarehouseZone[]
}

export interface LayoutValidationIssue {
  field: string
  message: string
}

const DEFAULT_CREATED_AT = '2026-07-28T00:00:00-03:00'

export const DEFAULT_WAREHOUSE_LAYOUT: WarehouseLayout = {
  id: 'layout-demo-v1',
  name: 'Mini CD demonstrativo',
  version: 1,
  status: 'active',
  createdAt: DEFAULT_CREATED_AT,
  updatedAt: DEFAULT_CREATED_AT,
  floor: {
    width: 72,
    depth: 36,
  },
  rackRows: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((aisle, index) => ({
    id: `rack-row-${aisle}`,
    aisle,
    baysPerSide: 8,
    levels: 7,
    pickingLevels: [1],
    origin: {
      x: 0,
      z: index * 8.1 - 24.3,
    },
    rotationY: 0,
    aisleWidth: 4.2,
    bayWidth: 2.25,
    rackDepth: 1.25,
    levelHeight: 1.45,
    active: true,
  })),
  zones: [
    {
      id: 'zone-receiving',
      name: 'Recebimento',
      type: 'receiving',
      origin: { x: -17, z: 29 },
      width: 6,
      depth: 4,
    },
    {
      id: 'zone-shipping',
      name: 'Expedição',
      type: 'shipping',
      origin: { x: 17, z: 29 },
      width: 6,
      depth: 4,
    },
  ],
}

export function validateWarehouseLayout(
  layout: WarehouseLayout,
): LayoutValidationIssue[] {
  const issues: LayoutValidationIssue[] = []
  const aisles = new Set<string>()

  if (!layout.name.trim()) {
    issues.push({ field: 'name', message: 'O layout precisa ter um nome.' })
  }

  if (layout.floor.width <= 0 || layout.floor.depth <= 0) {
    issues.push({
      field: 'floor',
      message: 'As dimensões do piso precisam ser maiores que zero.',
    })
  }

  layout.rackRows.forEach((row, index) => {
    const fieldPrefix = `rackRows.${index}`
    const normalizedAisle = row.aisle.trim().toUpperCase()

    if (!normalizedAisle) {
      issues.push({
        field: `${fieldPrefix}.aisle`,
        message: 'Toda estrutura precisa ter uma rua identificada.',
      })
    } else if (aisles.has(normalizedAisle)) {
      issues.push({
        field: `${fieldPrefix}.aisle`,
        message: `A rua ${normalizedAisle} está duplicada no layout.`,
      })
    } else {
      aisles.add(normalizedAisle)
    }

    if (row.baysPerSide <= 0) {
      issues.push({
        field: `${fieldPrefix}.baysPerSide`,
        message: `A rua ${normalizedAisle || index + 1} precisa ter ao menos um módulo.`,
      })
    }

    if (row.levels <= 0) {
      issues.push({
        field: `${fieldPrefix}.levels`,
        message: `A rua ${normalizedAisle || index + 1} precisa ter ao menos um nível.`,
      })
    }

    row.pickingLevels.forEach((level) => {
      if (level < 1 || level > row.levels) {
        issues.push({
          field: `${fieldPrefix}.pickingLevels`,
          message: `O nível de picking ${level} não existe na rua ${normalizedAisle}.`,
        })
      }
    })
  })

  return issues
}

export function cloneLayoutAsDraft(
  source: WarehouseLayout,
  nextVersion = source.version + 1,
): WarehouseLayout {
  const now = new Date().toISOString()

  return {
    ...structuredClone(source),
    id: `${source.id.split('-v')[0]}-v${nextVersion}`,
    version: nextVersion,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }
}
