import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_WAREHOUSE_LAYOUT, validateWarehouseLayout, type WarehouseLayout } from '../domain/layout'
import { generateDemoWarehouse, generateWarehouseSkeleton, type SlotStatus, type WarehouseLocation } from '../domain/warehouse'
import type { RoutePlan } from '../domain/routePlanning'
import type { TraceEvent, TraceEventType } from '../domain/traceability'

export type RenderMode='operational'|'realistic'
export type ActivePanel='overview'|'layout'|'trace'|'movement'|'simulation'|'import'
export interface ImportSummary {fileName:string;rowsRead:number;importedRows:number;issueCount:number}
export interface ActionResult {ok:boolean;message:string}
export interface MovementInput {source:string;destination:string;quantity:number;type:Extract<TraceEventType,'putaway'|'transfer'|'replenishment'|'picking'|'dispatch'>;actorName:string;documentReference?:string;physicalConfirmation:boolean}

interface DigitalTwinState {
 layout:WarehouseLayout
 locations:WarehouseLocation[]
 traceEvents:TraceEvent[]
 dataSource:'demo'|'csv'|'manual'
 importSummary:ImportSummary|null
 selectedAddress:string|null
 traceQuery:string
 visibleStatuses:Record<SlotStatus,boolean>
 renderMode:RenderMode
 activePanel:ActivePanel
 simulationTasks:string[]
 blockedCrossAisles:{left:boolean;right:boolean}
 routePlan:RoutePlan|null
 routeRunToken:number
 cameraResetToken:number
 selectAddress:(address:string|null)=>void
 setTraceQuery:(query:string)=>void
 setActivePanel:(panel:ActivePanel)=>void
 toggleStatus:(status:SlotStatus)=>void
 setRenderMode:(mode:RenderMode)=>void
 resetCamera:()=>void
 applyLayout:(layout:WarehouseLayout,mode:'preserve'|'empty')=>ActionResult
 loadImportedWarehouse:(locations:WarehouseLocation[],summary:ImportSummary)=>void
 restoreDemo:()=>void
 registerMovement:(input:MovementInput)=>ActionResult
 recordPhysicalCount:(address:string,quantity:number,actorName:string)=>ActionResult
 addSimulationTask:(address:string)=>ActionResult
 removeSimulationTask:(address:string)=>void
 clearSimulationTasks:()=>void
 setCrossAisleBlocked:(side:'left'|'right',blocked:boolean)=>void
 setRoutePlan:(plan:RoutePlan|null)=>void
 runRouteAnimation:()=>void
}

const allStatusesVisible:Record<SlotStatus,boolean>={occupied:true,empty:true,blocked:true,divergent:true}

function stockIdentity(location:WarehouseLocation){return{sku:location.sku??'SEM-SKU',description:location.description??'Produto não informado',lot:location.lot,expirationDate:location.expirationDate,unitOfMeasure:'UN'}}

function seedTraceEvents(locations:WarehouseLocation[],source:'simulation'|'csv'='simulation'):TraceEvent[]{
 const baseTime=new Date('2026-07-27T08:00:00-03:00').getTime()
 return locations.filter(location=>location.quantity>0&&location.sku).map((location,index)=>({
   id:`seed-${location.address}`,
   occurredAt:new Date(baseTime+index*60000).toISOString(),
   recordedAt:new Date(baseTime+index*60000+5000).toISOString(),
   type:'count',source,handlingUnitCode:location.handlingUnitCode,stock:stockIdentity(location),quantity:location.quantity,toAddress:location.address,
   actor:{id:'seed',name:source==='csv'?'Importação CSV':'Cenário demonstrativo',role:'sistema'},
   confirmation:location.confirmation==='physically-confirmed'?'physically-confirmed':'system-only',notes:source==='csv'?'Estado inicial importado do arquivo.':'Evento sintético para demonstração do histórico.'
 }))
}

function clearStock(location:WarehouseLocation):WarehouseLocation{return{...location,status:'empty',confirmation:'system-only',sku:undefined,description:undefined,lot:undefined,handlingUnitCode:undefined,expirationDate:undefined,quantity:0,lastCheckedAt:undefined}}

function findSource(locations:WarehouseLocation[],source:string):WarehouseLocation|undefined{
 const normalized=source.trim().toUpperCase()
 return locations.find(location=>location.address===normalized||location.handlingUnitCode?.toUpperCase()===normalized)
}

function eventId(prefix:string):string{return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}

const initialLocations=generateDemoWarehouse(DEFAULT_WAREHOUSE_LAYOUT)

export const useDigitalTwinStore=create<DigitalTwinState>()(persist((set,get)=>({
 layout:DEFAULT_WAREHOUSE_LAYOUT,
 locations:initialLocations,
 traceEvents:seedTraceEvents(initialLocations),
 dataSource:'demo',
 importSummary:null,
 selectedAddress:null,
 traceQuery:'',
 visibleStatuses:allStatusesVisible,
 renderMode:'operational',
 activePanel:'overview',
 simulationTasks:[],
 blockedCrossAisles:{left:false,right:false},
 routePlan:null,
 routeRunToken:0,
 cameraResetToken:0,
 selectAddress:selectedAddress=>set({selectedAddress}),
 setTraceQuery:traceQuery=>set({traceQuery}),
 setActivePanel:activePanel=>set({activePanel}),
 toggleStatus:status=>set(state=>({visibleStatuses:{...state.visibleStatuses,[status]:!state.visibleStatuses[status]}})),
 setRenderMode:renderMode=>set({renderMode}),
 resetCamera:()=>set(state=>({selectedAddress:null,cameraResetToken:state.cameraResetToken+1})),
 applyLayout:(layout,mode)=>{
   const issues=validateWarehouseLayout(layout)
   if(issues.length)return{ok:false,message:issues[0].message}
   const nextLayout={...layout,status:'active' as const,updatedAt:new Date().toISOString()}
   const skeleton=generateWarehouseSkeleton(nextLayout)
   const nextAddresses=new Set(skeleton.map(location=>location.address))
   const occupiedRemoved=get().locations.filter(location=>location.quantity>0&&!nextAddresses.has(location.address))
   if(mode==='preserve'&&occupiedRemoved.length>0)return{ok:false,message:`A alteração removeria ${occupiedRemoved.length} posição(ões) com estoque. Transfira o saldo ou crie o layout vazio.`}
   const currentByAddress=new Map<string,WarehouseLocation>(get().locations.map(location=>[location.address,location]))
   const locations=mode==='empty'?skeleton:skeleton.map(base=>{const current=currentByAddress.get(base.address);return current?{...base,status:current.status,confirmation:current.confirmation,sku:current.sku,description:current.description,lot:current.lot,handlingUnitCode:current.handlingUnitCode,expirationDate:current.expirationDate,quantity:current.quantity,capacity:current.capacity,lastCheckedAt:current.lastCheckedAt}:base})
   set(state=>({layout:nextLayout,locations,traceEvents:mode==='empty'?[]:state.traceEvents,dataSource:'manual',importSummary:null,selectedAddress:null,simulationTasks:[],routePlan:null,cameraResetToken:state.cameraResetToken+1}))
   return{ok:true,message:mode==='empty'?'Novo layout criado vazio.':'Layout atualizado preservando os endereços compatíveis.'}
 },
 loadImportedWarehouse:(locations,importSummary)=>set(state=>({locations,traceEvents:seedTraceEvents(locations,'csv'),dataSource:'csv',importSummary,selectedAddress:null,simulationTasks:[],routePlan:null,cameraResetToken:state.cameraResetToken+1})),
 restoreDemo:()=>{const locations=generateDemoWarehouse(DEFAULT_WAREHOUSE_LAYOUT);set(state=>({layout:DEFAULT_WAREHOUSE_LAYOUT,locations,traceEvents:seedTraceEvents(locations),dataSource:'demo',importSummary:null,selectedAddress:null,simulationTasks:[],routePlan:null,cameraResetToken:state.cameraResetToken+1}))},
 registerMovement:input=>{
   const state=get();const source=findSource(state.locations,input.source);const destination=state.locations.find(location=>location.address===input.destination.toUpperCase())
   if(!source)return{ok:false,message:'Origem ou unidade logística não encontrada.'}
   if(!destination)return{ok:false,message:'Endereço de destino não encontrado.'}
   if(source.address===destination.address)return{ok:false,message:'Origem e destino precisam ser diferentes.'}
   if(source.status==='blocked'||destination.status==='blocked')return{ok:false,message:'Não é permitido movimentar estoque de ou para posição bloqueada.'}
   if(input.quantity<=0||input.quantity>source.quantity)return{ok:false,message:`Quantidade inválida. Saldo disponível na origem: ${source.quantity}.`}
   if(destination.quantity>0&&destination.sku!==source.sku)return{ok:false,message:'O destino contém outro SKU. Faça a transferência para uma posição vazia ou compatível.'}
   const fullMove=input.quantity===source.quantity
   const movedHandlingUnit=fullMove?source.handlingUnitCode:(source.handlingUnitCode?`${source.handlingUnitCode}-P${Date.now().toString().slice(-4)}`:undefined)
   const nextSource=fullMove?clearStock(source):{...source,quantity:source.quantity-input.quantity,confirmation:input.physicalConfirmation?'physically-confirmed':source.confirmation,lastCheckedAt:input.physicalConfirmation?new Date().toISOString():source.lastCheckedAt}
   const nextDestination:WarehouseLocation={...destination,status:'occupied',confirmation:input.physicalConfirmation?'physically-confirmed':'system-only',sku:source.sku,description:source.description,lot:source.lot,handlingUnitCode:destination.handlingUnitCode??movedHandlingUnit,expirationDate:source.expirationDate,quantity:destination.quantity+input.quantity,lastCheckedAt:input.physicalConfirmation?new Date().toISOString():undefined}
   const now=new Date().toISOString()
   const event:TraceEvent={id:eventId(input.type),occurredAt:now,recordedAt:now,type:input.type,source:'manual',actor:{id:input.actorName.toLocaleLowerCase('pt-BR').replace(/\s+/g,'-'),name:input.actorName||'Operador',role:'operador'},handlingUnitCode:movedHandlingUnit??source.handlingUnitCode,stock:stockIdentity(source),quantity:input.quantity,fromAddress:source.address,toAddress:destination.address,documentReference:input.documentReference||undefined,confirmation:input.physicalConfirmation?'physically-confirmed':'system-only'}
   set(current=>({locations:current.locations.map(location=>location.address===source.address?nextSource:location.address===destination.address?nextDestination:location),traceEvents:[...current.traceEvents,event],selectedAddress:destination.address,traceQuery:movedHandlingUnit??source.sku??destination.address}))
   return{ok:true,message:`Movimentação registrada: ${source.address} → ${destination.address}.`}
 },
 recordPhysicalCount:(address,quantity,actorName)=>{
   const location=get().locations.find(item=>item.address===address)
   if(!location)return{ok:false,message:'Endereço não encontrado.'}
   if(quantity<0)return{ok:false,message:'A quantidade física não pode ser negativa.'}
   if(quantity>0&&!location.sku)return{ok:false,message:'A posição está vazia no sistema. Identifique o produto por importação ou movimentação antes de confirmar saldo positivo.'}
   const now=new Date().toISOString();const updated:WarehouseLocation={...location,quantity,status:quantity===0?'empty':'occupied',confirmation:'physically-confirmed',lastCheckedAt:now}
   if(quantity===0){updated.sku=undefined;updated.description=undefined;updated.lot=undefined;updated.handlingUnitCode=undefined;updated.expirationDate=undefined}
   const event:TraceEvent={id:eventId('count'),occurredAt:now,recordedAt:now,type:'count',source:'mobile',actor:{id:actorName.toLocaleLowerCase('pt-BR').replace(/\s+/g,'-'),name:actorName||'Conferente',role:'conferente'},handlingUnitCode:location.handlingUnitCode,stock:stockIdentity(location),quantity,toAddress:address,confirmation:'physically-confirmed',notes:'Contagem física registrada pelo módulo móvel.'}
   set(state=>({locations:state.locations.map(item=>item.address===address?updated:item),traceEvents:[...state.traceEvents,event],selectedAddress:address}))
   return{ok:true,message:`Contagem física confirmada em ${address}.`}
 },
 addSimulationTask:address=>{const normalized=address.toUpperCase();if(!get().locations.some(location=>location.address===normalized))return{ok:false,message:'Endereço não encontrado.'};if(get().simulationTasks.includes(normalized))return{ok:false,message:'A posição já está na lista de tarefas.'};set(state=>({simulationTasks:[...state.simulationTasks,normalized]}));return{ok:true,message:`${normalized} adicionado à simulação.`}},
 removeSimulationTask:address=>set(state=>({simulationTasks:state.simulationTasks.filter(item=>item!==address)})),
 clearSimulationTasks:()=>set({simulationTasks:[],routePlan:null}),
 setCrossAisleBlocked:(side,blocked)=>set(state=>({blockedCrossAisles:{...state.blockedCrossAisles,[side]:blocked},routePlan:null})),
 setRoutePlan:routePlan=>set({routePlan}),
 runRouteAnimation:()=>set(state=>({routeRunToken:state.routeRunToken+1})),
}),{
 name:'cd-digital-3d-state',version:3,storage:createJSONStorage(()=>localStorage),
 partialize:state=>({layout:state.layout,locations:state.locations,traceEvents:state.traceEvents,dataSource:state.dataSource,importSummary:state.importSummary,renderMode:state.renderMode})
}))
