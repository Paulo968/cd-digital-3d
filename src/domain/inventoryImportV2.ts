import type { ConfirmationStatus, SlotStatus, WarehouseLocation } from './warehouse'

export interface ImportIssue { line:number; message:string }
export interface InventoryImportResult { locations:WarehouseLocation[]; rowsRead:number; importedRows:number; issues:ImportIssue[] }

type CsvRecord=Record<string,string>
const HEADER_ALIASES:Record<string,string[]>={
 address:['endereco','endereço','address','localizacao','localização'],sku:['sku','codigo','código','material','produto_codigo'],description:['descricao','descrição','produto','material_descricao'],quantity:['quantidade','qtd','saldo','estoque'],capacity:['capacidade','capacidade_maxima','capacidade_máxima'],lot:['lote','batch'],handlingUnitCode:['pallet','unidade_logistica','handling_unit','hu','etiqueta'],expirationDate:['validade','expiration_date','vencimento'],status:['status','situacao','situação'],confirmation:['confirmacao','confirmação','conferencia','conferência'],lastCheckedAt:['ultima_conferencia','última_conferência','conferido_em']
}
function normalizeText(value:string):string{return value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function parseCsvLine(line:string,delimiter:string):string[]{const values:string[]=[];let current='',quoted=false;for(let i=0;i<line.length;i+=1){const char=line[i],next=line[i+1];if(char==='"'&&quoted&&next==='"'){current+='"';i+=1;continue}if(char==='"'){quoted=!quoted;continue}if(char===delimiter&&!quoted){values.push(current.trim());current='';continue}current+=char}values.push(current.trim());return values}
function findColumn(headers:string[],canonical:string):number{const aliases=HEADER_ALIASES[canonical].map(normalizeText);return headers.findIndex(header=>aliases.includes(normalizeText(header)))}
function readField(values:string[],indexes:Record<string,number>,field:string):string{const index=indexes[field];return index>=0?values[index]?.trim()??'':''}
function normalizeAddress(value:string):string{const compact=value.trim().toUpperCase().replace(/\s+/g,'').replace(/[./_]/g,'-');const match=compact.match(/^([A-Z0-9]+)-?(\d{1,3})-?(\d{1,2})$/);if(!match)return compact;return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`}
function parseNumber(value:string,fallback:number):number{if(!value)return fallback;const parsed=Number(value.replace(/\./g,'').replace(',','.'));return Number.isFinite(parsed)?parsed:fallback}
function parseStatus(value:string,quantity:number):SlotStatus{const normalized=normalizeText(value);if(['bloqueado','bloqueada','blocked'].includes(normalized))return'blocked';if(['divergente','divergencia','divergent'].includes(normalized))return'divergent';if(['vazio','vazia','empty','livre'].includes(normalized))return'empty';if(['ocupado','ocupada','occupied'].includes(normalized))return'occupied';return quantity>0?'occupied':'empty'}
function parseConfirmation(value:string):ConfirmationStatus{const normalized=normalizeText(value);if(['confirmado','confirmada','fisico','fisica','physical','physically-confirmed'].includes(normalized))return'physically-confirmed';if(['pendente','aguardando','pending','pending-check'].includes(normalized))return'pending-check';return'system-only'}

export function importInventoryForLayout(csvText:string,skeleton:WarehouseLocation[]):InventoryImportResult{
 const lines=csvText.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim().length>0)
 const byAddress=new Map(skeleton.map(location=>[location.address,location]));const issues:ImportIssue[]=[]
 if(lines.length===0)return{locations:skeleton,rowsRead:0,importedRows:0,issues:[{line:0,message:'O arquivo está vazio.'}]}
 const headerLine=lines[0];const delimiter=(headerLine.match(/;/g)?.length??0)>(headerLine.match(/,/g)?.length??0)?';':',';const headers=parseCsvLine(headerLine,delimiter)
 const indexes=Object.fromEntries(Object.keys(HEADER_ALIASES).map(field=>[field,findColumn(headers,field)]))
 if(indexes.address<0)return{locations:skeleton,rowsRead:Math.max(lines.length-1,0),importedRows:0,issues:[{line:1,message:'Coluna obrigatória de endereço não encontrada.'}]}
 const imported=new Set<string>();let importedRows=0
 lines.slice(1).forEach((line,rowIndex)=>{const lineNumber=rowIndex+2;const values=parseCsvLine(line,delimiter);const record:CsvRecord=Object.fromEntries(Object.keys(HEADER_ALIASES).map(field=>[field,readField(values,indexes,field)]));const address=normalizeAddress(record.address);const base=byAddress.get(address)
   if(!base){issues.push({line:lineNumber,message:`Endereço "${record.address}" não existe no layout ativo.`});return}
   if(imported.has(address)){issues.push({line:lineNumber,message:`Endereço duplicado no arquivo: ${address}.`});return}
   const quantity=Math.max(0,parseNumber(record.quantity,0));const capacity=Math.max(0,parseNumber(record.capacity,base.capacity));const status=parseStatus(record.status,quantity);const confirmation=parseConfirmation(record.confirmation)
   byAddress.set(address,{...base,status,confirmation,sku:record.sku||undefined,description:record.description||undefined,lot:record.lot||undefined,handlingUnitCode:record.handlingUnitCode||undefined,expirationDate:record.expirationDate||undefined,quantity:status==='empty'||status==='blocked'?0:quantity,capacity,lastCheckedAt:confirmation==='physically-confirmed'?(record.lastCheckedAt||new Date().toISOString()):undefined})
   imported.add(address);importedRows+=1
 })
 return{locations:skeleton.map(location=>byAddress.get(location.address)??location),rowsRead:Math.max(lines.length-1,0),importedRows,issues}
}
