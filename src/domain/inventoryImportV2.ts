import type {
  SlotStatus,
  WarehouseLocation,
} from './warehouse'

export interface ImportIssue {
  line: number
  message: string
}

export interface InventoryImportResult {
  locations: WarehouseLocation[]
  rowsRead: number
  importedRows: number
  issues: ImportIssue[]
}

type CsvRecord = Record<string, string>

const HEADER_ALIASES: Record<string, string[]> = {
  address: ['endereco', 'endereço', 'address', 'localizacao', 'localização'],
  sku: ['sku', 'codigo', 'código', 'material', 'produto_codigo'],
  description: ['descricao', 'descrição', 'produto', 'material_descricao'],
  quantity: ['quantidade', 'qtd', 'saldo', 'estoque'],
  capacity: ['capacidade', 'capacidade_maxima', 'capacidade_máxima'],
  lot: ['lote', 'batch'],
  handlingUnitCode: [
    'pallet',
    'unidade_logistica',
    'handling_unit',
    'hu',
    'etiqueta',
  ],
  expirationDate: ['validade', 'expiration_date', 'vencimento'],
  status: ['status', 'situacao', 'situação'],
  confirmation: ['confirmacao', 'confirmação', 'conferencia', 'conferência'],
  lastCheckedAt: [
    'ultima_conferencia',
    'última_conferência',
    'conferido_em',
  ],
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"' && quoted && nextCharacter === '"') {
      current += '"'
      index += 1
      continue
    }

    if (character === '"') {
      quoted = !quoted
      continue
    }

    if (character === delimiter && !quoted) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  values.push(current.trim())
  return values
}

function findColumn(headers: string[], canonical: string): number {
  const aliases = HEADER_ALIASES[canonical].map(normalizeText)
  return headers.findIndex((header) => aliases.includes(normalizeText(header)))
}

function readField(
  values: string[],
  indexes: Record<string, number>,
  field: string,
): string {
  const index = indexes[field]
  return index >= 0 ? values[index]?.trim() ?? '' : ''
}

function normalizeAddress(value: string): string {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[./_]/g, '-')
  const match = compact.match(/^([A-Z0-9]+)-?(\d{1,3})-?(\d{1,2})$/)

  if (!match) return compact

  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function parseNumber(value: string, fallback: number): number {
  const compact = value.trim().replace(/\s/g, '')
  if (!compact) return fallback

  const comma = compact.lastIndexOf(',')
  const dot = compact.lastIndexOf('.')
  let normalized = compact

  if (comma >= 0 && dot >= 0) {
    normalized =
      comma > dot
        ? compact.replace(/\./g, '').replace(',', '.')
        : compact.replace(/,/g, '')
  } else if (comma >= 0) {
    normalized = compact.replace(',', '.')
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseStatus(value: string, quantity: number): SlotStatus {
  const normalized = normalizeText(value)

  if (['bloqueado', 'bloqueada', 'blocked'].includes(normalized)) {
    return 'blocked'
  }
  if (['divergente', 'divergencia', 'divergent'].includes(normalized)) {
    return 'divergent'
  }
  if (['vazio', 'vazia', 'empty', 'livre'].includes(normalized)) {
    return 'empty'
  }
  if (['ocupado', 'ocupada', 'occupied'].includes(normalized)) {
    return 'occupied'
  }

  return quantity > 0 ? 'occupied' : 'empty'
}

function isValidDate(value: string): boolean {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

export function importInventoryForLayout(
  csvText: string,
  skeleton: WarehouseLocation[],
): InventoryImportResult {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  const byAddress = new Map(
    skeleton.map((location) => [location.address, location]),
  )
  const issues: ImportIssue[] = []

  if (lines.length === 0) {
    return {
      locations: skeleton,
      rowsRead: 0,
      importedRows: 0,
      issues: [{ line: 0, message: 'O arquivo está vazio.' }],
    }
  }

  const headerLine = lines[0]
  const delimiter =
    (headerLine.match(/;/g)?.length ?? 0) >
    (headerLine.match(/,/g)?.length ?? 0)
      ? ';'
      : ','
  const headers = parseCsvLine(headerLine, delimiter)
  const indexes = Object.fromEntries(
    Object.keys(HEADER_ALIASES).map((field) => [
      field,
      findColumn(headers, field),
    ]),
  )

  if (indexes.address < 0) {
    return {
      locations: skeleton,
      rowsRead: Math.max(lines.length - 1, 0),
      importedRows: 0,
      issues: [
        { line: 1, message: 'Coluna obrigatória de endereço não encontrada.' },
      ],
    }
  }

  const importedAddresses = new Set<string>()
  const importedHandlingUnits = new Map<string, string>()
  let importedRows = 0

  lines.slice(1).forEach((line, rowIndex) => {
    const lineNumber = rowIndex + 2
    const values = parseCsvLine(line, delimiter)
    const record: CsvRecord = Object.fromEntries(
      Object.keys(HEADER_ALIASES).map((field) => [
        field,
        readField(values, indexes, field),
      ]),
    )
    const address = normalizeAddress(record.address)
    const base = byAddress.get(address)

    if (!base) {
      issues.push({
        line: lineNumber,
        message: `Endereço "${record.address}" não existe no layout ativo.`,
      })
      return
    }

    if (importedAddresses.has(address)) {
      issues.push({
        line: lineNumber,
        message: `Endereço duplicado no arquivo: ${address}.`,
      })
      return
    }

    const quantity = Math.max(0, parseNumber(record.quantity, 0))
    const capacity = Math.max(0, parseNumber(record.capacity, base.capacity))
    const status = parseStatus(record.status, quantity)
    const handlingUnitCode = record.handlingUnitCode.trim().toUpperCase()

    if (capacity <= 0) {
      issues.push({
        line: lineNumber,
        message: `A capacidade de ${address} precisa ser maior que zero.`,
      })
      return
    }

    if (quantity > capacity) {
      issues.push({
        line: lineNumber,
        message: `Quantidade ${quantity} excede a capacidade ${capacity} de ${address}.`,
      })
      return
    }

    if ((status === 'occupied' || status === 'divergent') && quantity <= 0) {
      issues.push({
        line: lineNumber,
        message: `${address} foi informado como ocupado/divergente, mas a quantidade é zero.`,
      })
      return
    }

    if ((status === 'empty' || status === 'blocked') && quantity > 0) {
      issues.push({
        line: lineNumber,
        message: `${address} foi informado como vazio/bloqueado, mas possui quantidade maior que zero.`,
      })
      return
    }

    if (quantity > 0 && !record.sku.trim()) {
      issues.push({
        line: lineNumber,
        message: `${address} possui saldo, mas não possui SKU identificado.`,
      })
      return
    }

    if (!isValidDate(record.expirationDate)) {
      issues.push({
        line: lineNumber,
        message: `Validade inválida em ${address}. Use o formato AAAA-MM-DD.`,
      })
      return
    }

    if (handlingUnitCode) {
      const previousAddress = importedHandlingUnits.get(handlingUnitCode)
      if (previousAddress) {
        issues.push({
          line: lineNumber,
          message: `Unidade logística ${handlingUnitCode} já foi informada em ${previousAddress}.`,
        })
        return
      }
      importedHandlingUnits.set(handlingUnitCode, address)
    }

    const hasStock = status === 'occupied' || status === 'divergent'

    // Arquivos de ERP/WMS são tratados como fotografia sistêmica. Uma coluna
    // chamada "confirmação" não transforma o dado importado em evidência de
    // conferência física; isso só ocorre pelos fluxos explícitos do sistema.
    if (
      record.confirmation &&
      normalizeText(record.confirmation) !== 'sistema' &&
      normalizeText(record.confirmation) !== 'system-only'
    ) {
      issues.push({
        line: lineNumber,
        message: `A confirmação física informada em ${address} foi ignorada; importe como dado sistêmico e registre a conferência pelo módulo operacional.`,
      })
    }

    byAddress.set(address, {
      ...base,
      status,
      confirmation: status === 'divergent' ? 'pending-check' : 'system-only',
      sku: hasStock ? record.sku.trim() || undefined : undefined,
      description: hasStock ? record.description.trim() || undefined : undefined,
      lot: hasStock ? record.lot.trim() || undefined : undefined,
      handlingUnitCode:
        hasStock && handlingUnitCode ? handlingUnitCode : undefined,
      expirationDate:
        hasStock && record.expirationDate ? record.expirationDate : undefined,
      quantity: hasStock ? quantity : 0,
      capacity,
      lastCheckedAt: undefined,
    })

    importedAddresses.add(address)
    importedRows += 1
  })

  return {
    locations: skeleton.map(
      (location) => byAddress.get(location.address) ?? location,
    ),
    rowsRead: Math.max(lines.length - 1, 0),
    importedRows,
    issues,
  }
}
