import { useEffect, useMemo, useState } from 'react'
import type { RackRowLayout, WarehouseLayout } from '../domain/layout'
import type { ActionResult } from '../store/digitalTwinStore'

interface EditableRow {id:string;aisle:string;baysPerSide:number;levels:number;pickingLevelsText:string;aisleWidth:number;bayWidth:number;rackDepth:number;levelHeight:number}
function toEditable(row:RackRowLayout):EditableRow{return{id:row.id,aisle:row.aisle,baysPerSide:row.baysPerSide,levels:row.levels,pickingLevelsText:row.pickingLevels.join(','),aisleWidth:row.aisleWidth,bayWidth:row.bayWidth,rackDepth:row.rackDepth,levelHeight:row.levelHeight}}
function nextAisle(rows:EditableRow[]):string{const used=new Set(rows.map(row=>row.aisle.toUpperCase()));for(let code=65;code<=90;code+=1){const value=String.fromCharCode(code);if(!used.has(value))return value}return `R${rows.length+1}`}

export function LayoutBuilderPanel({layout,onApply}:{layout:WarehouseLayout;onApply:(layout:WarehouseLayout,mode:'preserve'|'empty')=>ActionResult}){
 const [name,setName]=useState(layout.name);const [rows,setRows]=useState<EditableRow[]>(layout.rackRows.map(toEditable));const [feedback,setFeedback]=useState('')
 useEffect(()=>{setName(layout.name);setRows(layout.rackRows.map(toEditable))},[layout])
 const totalPositions=useMemo(()=>rows.reduce((total,row)=>total+row.baysPerSide*2*row.levels,0),[rows])
 function patchRow(id:string,patch:Partial<EditableRow>){setRows(current=>current.map(row=>row.id===id?{...row,...patch}:row))}
 function buildLayout():WarehouseLayout{
   let cursor=0
   const normalizedRows: RackRowLayout[]=rows.map(row=>{
     const spacing=row.aisleWidth+row.rackDepth*2+1.4
     const z=cursor;cursor+=spacing
     const pickingLevels=row.pickingLevelsText.split(',').map(value=>Number(value.trim())).filter(value=>Number.isInteger(value)&&value>0)
     return{id:row.id||`rack-row-${row.aisle}`,aisle:row.aisle.trim().toUpperCase(),baysPerSide:Number(row.baysPerSide),levels:Number(row.levels),pickingLevels:pickingLevels.length?pickingLevels:[1],origin:{x:0,z},rotationY:0,aisleWidth:Number(row.aisleWidth),bayWidth:Number(row.bayWidth),rackDepth:Number(row.rackDepth),levelHeight:Number(row.levelHeight),active:true}
   })
   const center=(cursor-(normalizedRows.at(-1)?.aisleWidth??0))/2
   normalizedRows.forEach(row=>{row.origin.z-=center})
   const maxRackLength=Math.max(...normalizedRows.map(row=>row.baysPerSide*row.bayWidth),12)
   const depth=Math.max(cursor+16,28),width=maxRackLength+20,now=new Date().toISOString(),version=layout.version+1
   return{id:`layout-${Date.now()}-v${version}`,name:name.trim(),version,status:'draft',createdAt:now,updatedAt:now,floor:{width,depth},rackRows:normalizedRows,zones:[{id:'zone-receiving',name:'Recebimento',type:'receiving',origin:{x:-width/2+5,z:depth/2-4},width:7,depth:4},{id:'zone-shipping',name:'Expedição',type:'shipping',origin:{x:width/2-5,z:depth/2-4},width:7,depth:4},{id:'zone-quarantine',name:'Quarentena',type:'quarantine',origin:{x:0,z:depth/2-4},width:6,depth:4}]}
 }
 function apply(mode:'preserve'|'empty'){if(rows.length===0){setFeedback('Adicione pelo menos uma rua.');return}const result=onApply(buildLayout(),mode);setFeedback(result.message)}
 return<section className="panel-section">
   <div className="section-heading"><div><span className="eyebrow">Construtor guiado</span><h2>Layout do centro de distribuição</h2></div><span className="version-badge">v{layout.version}</span></div>
   <p className="muted">Monte ruas, módulos, níveis e picking. A versão ativa não é destruída sem validação de estoque.</p>
   <label className="field"><span>Nome do layout</span><input value={name} onChange={event=>setName(event.target.value)}/></label>
   <div className="layout-summary"><strong>{rows.length}</strong><span>ruas</span><strong>{totalPositions.toLocaleString('pt-BR')}</strong><span>endereços</span></div>
   <div className="layout-preview" aria-label="Prévia 2D do layout">{rows.map(row=><div key={`preview-${row.id}`} style={{width:`${Math.min(100,Math.max(18,row.baysPerSide*5))}%`}}><span>Rua {row.aisle}</span><i/></div>)}</div>
   <div className="layout-rows">
    {rows.map((row,index)=><article className="layout-row-card" key={row.id}>
      <div className="layout-row-title"><strong>Rua {row.aisle||index+1}</strong><button type="button" className="danger-link" onClick={()=>setRows(current=>current.filter(item=>item.id!==row.id))}>Remover</button></div>
      <div className="form-grid compact">
       <label><span>Rua</span><input value={row.aisle} maxLength={3} onChange={event=>patchRow(row.id,{aisle:event.target.value.toUpperCase()})}/></label>
       <label><span>Módulos/lado</span><input type="number" min="1" max="40" value={row.baysPerSide} onChange={event=>patchRow(row.id,{baysPerSide:Number(event.target.value)})}/></label>
       <label><span>Níveis</span><input type="number" min="1" max="14" value={row.levels} onChange={event=>patchRow(row.id,{levels:Number(event.target.value)})}/></label>
       <label><span>Níveis picking</span><input value={row.pickingLevelsText} placeholder="1 ou 1,2" onChange={event=>patchRow(row.id,{pickingLevelsText:event.target.value})}/></label>
       <label><span>Corredor (m)</span><input type="number" min="2.4" step="0.1" value={row.aisleWidth} onChange={event=>patchRow(row.id,{aisleWidth:Number(event.target.value)})}/></label>
       <label><span>Módulo (m)</span><input type="number" min="1" step="0.05" value={row.bayWidth} onChange={event=>patchRow(row.id,{bayWidth:Number(event.target.value)})}/></label>
      </div>
    </article>)}
   </div>
   <button type="button" className="secondary wide" onClick={()=>{const aisle=nextAisle(rows);setRows(current=>[...current,{id:`rack-row-${aisle}-${Date.now()}`,aisle,baysPerSide:8,levels:7,pickingLevelsText:'1',aisleWidth:4.2,bayWidth:2.25,rackDepth:1.25,levelHeight:1.45}])}}>+ Adicionar rua</button>
   <div className="action-stack"><button type="button" className="primary" onClick={()=>apply('preserve')}>Aplicar preservando estoque</button><button type="button" className="danger" onClick={()=>apply('empty')}>Criar novo layout vazio</button></div>
   {feedback&&<div className="feedback">{feedback}</div>}
 </section>
}
