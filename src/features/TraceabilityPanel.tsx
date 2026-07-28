import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import QRCode from 'qrcode'
import type { TraceEvent } from '../domain/traceability'
import type { WarehouseLocation } from '../domain/warehouse'
import './traceability.css'

const EVENT_LABEL:Record<TraceEvent['type'],string>={receipt:'Recebimento',putaway:'Armazenagem',transfer:'Transferência',replenishment:'Reabastecimento',picking:'Picking',dispatch:'Expedição',count:'Contagem',adjustment:'Ajuste',block:'Bloqueio',unblock:'Desbloqueio'}
function eventMatches(event:TraceEvent,location:WarehouseLocation):boolean{return Boolean((location.handlingUnitCode&&event.handlingUnitCode===location.handlingUnitCode)||(location.sku&&event.stock.sku===location.sku&&event.stock.lot===location.lot)||event.fromAddress===location.address||event.toAddress===location.address)}
function parseScannedCode(raw:string):string{const parts=raw.trim().split('|');return parts.length>=3&&parts[0]==='CD3D'?parts.slice(2).join('|'):raw.trim()}

type Detector={detect:(source:ImageBitmap)=>Promise<Array<{rawValue:string}>>}
type DetectorCtor=new(options:{formats:string[]})=>Detector

export function TraceabilityPanel({locations,events,query,selectedAddress,onQuery,onSelect}:{locations:WarehouseLocation[];events:TraceEvent[];query:string;selectedAddress:string|null;onQuery:(value:string)=>void;onSelect:(address:string)=>void}){
 const [scanFeedback,setScanFeedback]=useState('');const cameraInput=useRef<HTMLInputElement | null>(null);const qrCanvas=useRef<HTMLCanvasElement | null>(null)
 const normalized=query.trim().toLocaleLowerCase('pt-BR')
 const results=useMemo(()=>{if(!normalized)return[];return locations.filter(location=>[location.address,location.handlingUnitCode,location.sku,location.description,location.lot,location.expirationDate].filter(Boolean).some(value=>value!.toLocaleLowerCase('pt-BR').includes(normalized))).slice(0,40)},[locations,normalized])
 const selected=locations.find(location=>location.address===selectedAddress)??results[0]
 const timeline=useMemo(()=>selected?events.filter(event=>eventMatches(event,selected)).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)):[],[events,selected])
 const qrValue=selected?`CD3D|${selected.handlingUnitCode?'HU':'ADDRESS'}|${selected.handlingUnitCode??selected.address}`:''
 useEffect(()=>{if(!qrCanvas.current||!qrValue)return;QRCode.toCanvas(qrCanvas.current,qrValue,{margin:1,width:240,errorCorrectionLevel:'M'}).catch(()=>{setScanFeedback('Não foi possível gerar o QR Code desta identificação.')})},[qrValue])
 function locateCode(value:string){const code=parseScannedCode(value).toUpperCase();const match=locations.find(location=>location.address===code||location.handlingUnitCode?.toUpperCase()===code);if(!match){setScanFeedback(`Código ${code} não encontrado.`);return}onQuery(code);onSelect(match.address);setScanFeedback(`Localizado em ${match.address}.`)}
 async function scanImage(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];event.target.value='';if(!file)return;const ctor=(window as unknown as {BarcodeDetector?:DetectorCtor}).BarcodeDetector;if(!ctor){setScanFeedback('Este navegador não possui leitura automática de QR. Digite o código no campo de busca.');return}try{const bitmap=await createImageBitmap(file);const detector=new ctor({formats:['qr_code']});const codes=await detector.detect(bitmap);bitmap.close();if(!codes[0]?.rawValue){setScanFeedback('Nenhum QR Code foi reconhecido na imagem.');return}locateCode(codes[0].rawValue)}catch{setScanFeedback('Não foi possível analisar a imagem capturada.')}}
 return<section className="panel-section">
  <div className="section-heading"><div><span className="eyebrow">Rastreabilidade</span><h2>Produto, lote e unidade logística</h2></div></div>
  <label className="field"><span>Pesquisar</span><input value={query} onChange={event=>onQuery(event.target.value)} placeholder="Endereço, SKU, lote, validade ou pallet"/></label>
  <input ref={cameraInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={scanImage}/>
  <button type="button" className="secondary wide" onClick={()=>cameraInput.current?.click()}>Ler QR com a câmera</button>
  {scanFeedback&&<div className="feedback">{scanFeedback}</div>}
  {normalized&&<div className="result-list">{results.length===0?<p className="empty-state">Nenhum registro encontrado.</p>:results.map(location=><button type="button" key={location.address} className={`result-item ${selected?.address===location.address?'active':''}`} onClick={()=>onSelect(location.address)}><span><strong>{location.handlingUnitCode??location.address}</strong><small>{location.sku??'Sem SKU'} · {location.lot??'Sem lote'}</small></span><span className="result-address">{location.address}</span></button>)}</div>}
  {selected&&<article className="trace-card">
    <div className="trace-identity"><div><span className="eyebrow">Estado atual</span><h3>{selected.handlingUnitCode??selected.address}</h3><p>{selected.description??'Posição sem produto informado'}</p></div><canvas ref={qrCanvas} className="trace-qr" aria-label={`QR Code de ${selected.handlingUnitCode??selected.address}`}/></div>
    <dl className="data-grid"><div><dt>Endereço</dt><dd>{selected.address}</dd></div><div><dt>SKU</dt><dd>{selected.sku??'—'}</dd></div><div><dt>Lote</dt><dd>{selected.lot??'—'}</dd></div><div><dt>Validade</dt><dd>{selected.expirationDate??'—'}</dd></div><div><dt>Quantidade</dt><dd>{selected.quantity}</dd></div><div><dt>Confirmação</dt><dd>{selected.confirmation==='physically-confirmed'?'Física':'Sistêmica'}</dd></div></dl>
    <h3 className="timeline-title">Linha do tempo</h3><div className="timeline">{timeline.length===0?<p className="empty-state">Ainda não há eventos para este item.</p>:timeline.map(event=><div className="timeline-event" key={event.id}><span className="timeline-dot"/><div><strong>{EVENT_LABEL[event.type]}</strong><small>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(event.occurredAt))} · {event.actor?.name??event.source}</small><p>{event.fromAddress?`${event.fromAddress} → `:''}{event.toAddress??''} · Qtd. {event.quantity}{event.confirmation==='physically-confirmed'?' · confirmado fisicamente':''}</p></div></div>)}</div>
  </article>}
 </section>
}