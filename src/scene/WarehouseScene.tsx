import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Line, OrbitControls, Text } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef, type ElementRef } from 'react'
import * as THREE from 'three'
import type { WarehouseLayout } from '../domain/layout'
import { getLocationWorldPoint, type RoutePlan } from '../domain/routePlanning'
import type { RenderMode } from '../store/digitalTwinStore'
import type { SlotStatus, WarehouseLocation } from '../domain/warehouse'

const STATUS_COLOR:Record<SlotStatus,string>={occupied:'#38bdf8',empty:'#64748b',blocked:'#ef4444',divergent:'#f59e0b'}
const PRODUCT_COLORS=['#60a5fa','#34d399','#fbbf24','#f472b6','#a78bfa','#fb7185','#22d3ee','#c084fc']
const DEFAULT_CAMERA=new THREE.Vector3(34,30,42)
const DEFAULT_TARGET=new THREE.Vector3(0,3,0)

function productColor(location:WarehouseLocation):THREE.Color{
 if(location.status==='divergent')return new THREE.Color('#f59e0b')
 const value=location.sku??location.address
 const hash=[...value].reduce((total,char)=>total+char.charCodeAt(0),0)
 return new THREE.Color(PRODUCT_COLORS[hash%PRODUCT_COLORS.length])
}

function configureInstance(mesh:THREE.InstancedMesh,index:number,position:THREE.Vector3,rotationY:number,scale:[number,number,number],color?:THREE.Color):void{
 const dummy=new THREE.Object3D();dummy.position.copy(position);dummy.rotation.y=rotationY;dummy.scale.set(...scale);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);if(color)mesh.setColorAt(index,color)
}

function RackInstances({layout,mode}:{layout:WarehouseLayout;mode:RenderMode}){
 const postRef=useRef<THREE.InstancedMesh | null>(null)
 const beamRef=useRef<THREE.InstancedMesh | null>(null)
 const rows=layout.rackRows.filter(row=>row.active)
 const postCount=rows.reduce((total,row)=>total+(row.baysPerSide+1)*4,0)
 const beamCount=rows.reduce((total,row)=>total+row.levels*4,0)
 const {invalidate}=useThree()
 useLayoutEffect(()=>{
   if(!postRef.current||!beamRef.current)return
   let postIndex=0,beamIndex=0
   rows.forEach(row=>{
     const rackLength=row.baysPerSide*row.bayWidth
     for(const sideDirection of[-1,1]){
       const sideCenter=sideDirection*(row.aisleWidth/2+row.rackDepth/2)
       for(let frame=0;frame<=row.baysPerSide;frame+=1){
         const localX=frame*row.bayWidth-rackLength/2
         for(const depthDirection of[-1,1]){
           const localZ=sideCenter+depthDirection*row.rackDepth/2
           const vector=new THREE.Vector3(localX,0,localZ).applyAxisAngle(new THREE.Vector3(0,1,0),row.rotationY)
           vector.x+=row.origin.x;vector.z+=row.origin.z;vector.y=row.levels*row.levelHeight/2+.2
           configureInstance(postRef.current!,postIndex,vector,row.rotationY,[.12,row.levels*row.levelHeight+.4,.12]);postIndex+=1
         }
       }
       for(let level=0;level<row.levels;level+=1){
         const y=level*row.levelHeight+.18
         for(const depthDirection of[-1,1]){
           const localZ=sideCenter+depthDirection*row.rackDepth/2
           const vector=new THREE.Vector3(0,y,localZ).applyAxisAngle(new THREE.Vector3(0,1,0),row.rotationY)
           vector.x+=row.origin.x;vector.z+=row.origin.z
           configureInstance(beamRef.current!,beamIndex,vector,row.rotationY,[rackLength,.11,.11]);beamIndex+=1
         }
       }
     }
   })
   postRef.current.instanceMatrix.needsUpdate=true;beamRef.current.instanceMatrix.needsUpdate=true;invalidate()
 },[layout,rows,invalidate])
 return<>
   <instancedMesh ref={postRef} args={[undefined,undefined,postCount]} castShadow={mode==='realistic'}>
     <boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#334155" metalness={.55} roughness={.42}/>
   </instancedMesh>
   <instancedMesh ref={beamRef} args={[undefined,undefined,beamCount]} castShadow={mode==='realistic'}>
     <boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f97316" metalness={.4} roughness={.48}/>
   </instancedMesh>
 </>
}

function SlotInstances({layout,locations,selectedAddress,onSelect}:{layout:WarehouseLayout;locations:WarehouseLocation[];selectedAddress:string|null;onSelect:(address:string)=>void}){
 const slotRef=useRef<THREE.InstancedMesh | null>(null)
 const loadRef=useRef<THREE.InstancedMesh | null>(null)
 const palletRef=useRef<THREE.InstancedMesh | null>(null)
 const occupied=useMemo(()=>locations.filter(location=>location.quantity>0&&location.status!=='blocked'),[locations])
 const {invalidate}=useThree()
 useLayoutEffect(()=>{
   if(slotRef.current){locations.forEach((location,index)=>{const row=layout.rackRows.find(item=>item.id===location.rackRowId);if(!row)return;const point=getLocationWorldPoint(layout,location);const position=new THREE.Vector3(point.x,point.y-.52,point.z);configureInstance(slotRef.current!,index,position,row.rotationY,[row.bayWidth*.84,.08,row.rackDepth*.82],new THREE.Color(STATUS_COLOR[location.status]))});slotRef.current.instanceMatrix.needsUpdate=true;if(slotRef.current.instanceColor)slotRef.current.instanceColor.needsUpdate=true}
   if(loadRef.current&&palletRef.current){occupied.forEach((location,index)=>{const row=layout.rackRows.find(item=>item.id===location.rackRowId);if(!row)return;const basePoint=getLocationWorldPoint(layout,location);const base=new THREE.Vector3(basePoint.x,basePoint.y,basePoint.z);const loadHeight=location.zone==='picking' ? 0.58 : 0.92;const pallet=base.clone();pallet.y-=.42;configureInstance(palletRef.current!,index,pallet,row.rotationY,[row.bayWidth*.76,.12,row.rackDepth*.76]);const load=base.clone();load.y=-.29+loadHeight/2+(location.level-.5)*row.levelHeight+.25;configureInstance(loadRef.current!,index,load,row.rotationY,[row.bayWidth*.69,loadHeight,row.rackDepth*.69],productColor(location))});loadRef.current.instanceMatrix.needsUpdate=true;palletRef.current.instanceMatrix.needsUpdate=true;if(loadRef.current.instanceColor)loadRef.current.instanceColor.needsUpdate=true}
   invalidate()
 },[layout,locations,occupied,invalidate])
 return<>
   <instancedMesh ref={slotRef} args={[undefined,undefined,locations.length]} onClick={event=>{event.stopPropagation();const index=event.instanceId;if(index!==undefined)onSelect(locations[index].address)}}>
     <boxGeometry args={[1,1,1]}/><meshStandardMaterial vertexColors transparent opacity={.24} roughness={.8}/>
   </instancedMesh>
   <instancedMesh ref={palletRef} args={[undefined,undefined,occupied.length]} onClick={event=>{event.stopPropagation();const index=event.instanceId;if(index!==undefined)onSelect(occupied[index].address)}} castShadow>
     <boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#8b5a2b" roughness={.86}/>
   </instancedMesh>
   <instancedMesh ref={loadRef} args={[undefined,undefined,occupied.length]} onClick={event=>{event.stopPropagation();const index=event.instanceId;if(index!==undefined)onSelect(occupied[index].address)}} castShadow>
     <boxGeometry args={[1,1,1]}/><meshStandardMaterial vertexColors roughness={.68}/>
   </instancedMesh>
   {selectedAddress&&<SelectedBeacon layout={layout} location={locations.find(location=>location.address===selectedAddress)}/>} 
 </>
}

function SelectedBeacon({layout,location}:{layout:WarehouseLayout;location?:WarehouseLocation}){
 const ringRef=useRef<THREE.Mesh | null>(null);const {invalidate}=useThree()
 useFrame(({clock})=>{if(!ringRef.current)return;const pulse=1+Math.sin(clock.elapsedTime*4.2)*.12;ringRef.current.scale.setScalar(pulse);ringRef.current.rotation.z+=.012;invalidate()})
 if(!location)return null
 const position=getLocationWorldPoint(layout,location)
 return<group position={[position.x,position.y,position.z]}>
   <mesh ref={ringRef} position={[0,-.53,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.9,.055,10,36]}/><meshBasicMaterial color={STATUS_COLOR[location.status]}/></mesh>
   <pointLight position={[0,.5,0]} color={STATUS_COLOR[location.status]} intensity={2} distance={5}/>
   <Billboard position={[0,1.4,0]}><mesh position={[0,0,-.02]}><planeGeometry args={[2.35,.62]}/><meshBasicMaterial color="#07111f" transparent opacity={.95}/></mesh><Text fontSize={.31} color="#fff" anchorX="center" anchorY="middle" outlineWidth={.025} outlineColor="#000">{location.address}</Text></Billboard>
 </group>
}

function AisleLabels({layout}:{layout:WarehouseLayout}){return<>{layout.rackRows.filter(row=>row.active).map(row=>{const rackLength=row.baysPerSide*row.bayWidth;const local=new THREE.Vector3(-rackLength/2-.7,2.8,0).applyAxisAngle(new THREE.Vector3(0,1,0),row.rotationY);local.x+=row.origin.x;local.z+=row.origin.z;return<Billboard key={row.id} position={local}><mesh><planeGeometry args={[2.1,.8]}/><meshStandardMaterial color="#075985"/></mesh><Text position={[0,0,.02]} fontSize={.38} color="#fff" anchorX="center" anchorY="middle">RUA {row.aisle}</Text></Billboard>})}</>}

function FloorAndZones({layout,mode}:{layout:WarehouseLayout;mode:RenderMode}){return<>
 <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[layout.floor.width,layout.floor.depth]}/><meshStandardMaterial color={mode==='operational'?'#e5e7eb':'#222b34'} roughness={.96}/></mesh>
 <gridHelper args={[Math.max(layout.floor.width,layout.floor.depth),Math.round(Math.max(layout.floor.width,layout.floor.depth)*1.5),mode==='operational'?'#b8c1cc':'#334155',mode==='operational'?'#d3d9df':'#263442']} position={[0,.012,0]}/>
 {layout.zones.map(zone=><group key={zone.id} position={[zone.origin.x,.03,zone.origin.z]}><mesh><boxGeometry args={[zone.width,.035,zone.depth]}/><meshStandardMaterial color={zone.type==='receiving'?'#22c55e':zone.type==='shipping'?'#38bdf8':'#f59e0b'} transparent opacity={.25}/></mesh><Text position={[0,.05,0]} rotation={[-Math.PI/2,0,0]} fontSize={.38} color={mode==='operational'?'#0f172a':'#fff'} anchorX="center" anchorY="middle">{zone.name.toUpperCase()}</Text></group>)}
 </>}

function Forklift({plan,runToken}:{plan:RoutePlan|null;runToken:number}){
 const groupRef=useRef<THREE.Group | null>(null);const progress=useRef(0);const running=useRef(false);const {invalidate}=useThree()
 const points=plan?.points??[];const lengths=useMemo(()=>points.slice(1).map((point,index)=>Math.hypot(point.x-points[index].x,point.z-points[index].z)),[points]);const total=lengths.reduce((sum,value)=>sum+value,0)
 useEffect(()=>{progress.current=0;running.current=Boolean(plan&&points.length>1);if(groupRef.current&&points[0])groupRef.current.position.set(points[0].x,.18,points[0].z);invalidate()},[runToken,plan,points,invalidate])
 useFrame((_,delta)=>{if(!running.current||!groupRef.current||!plan)return;progress.current+=delta*4.2;const distance=Math.min(progress.current,total);let remaining=distance,segment=0;while(segment<lengths.length&&remaining>lengths[segment]){remaining-=lengths[segment];segment+=1}if(segment>=lengths.length){running.current=false;return}const from=points[segment],to=points[segment+1],ratio=lengths[segment]===0?1:remaining/lengths[segment];const x=THREE.MathUtils.lerp(from.x,to.x,ratio),z=THREE.MathUtils.lerp(from.z,to.z,ratio);groupRef.current.position.set(x,.18,z);groupRef.current.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);invalidate()})
 return<group ref={groupRef}>
  <mesh position={[0,.35,0]} castShadow><boxGeometry args={[1.15,.65,1.6]}/><meshStandardMaterial color="#f59e0b"/></mesh>
  <mesh position={[0,.95,.15]} castShadow><boxGeometry args={[.85,.75,.9]}/><meshStandardMaterial color="#1f2937"/></mesh>
  <mesh position={[0,.9,-.9]}><boxGeometry args={[.12,1.8,.12]}/><meshStandardMaterial color="#334155" metalness={.6}/></mesh>
  <mesh position={[-.28,.18,-1.35]}><boxGeometry args={[.12,.08,1.35]}/><meshStandardMaterial color="#475569" metalness={.7}/></mesh>
  <mesh position={[.28,.18,-1.35]}><boxGeometry args={[.12,.08,1.35]}/><meshStandardMaterial color="#475569" metalness={.7}/></mesh>
 </group>
}

function CameraRig({layout,selected,resetToken}:{layout:WarehouseLayout;selected?:WarehouseLocation;resetToken:number}){
 const controlsRef=useRef<ElementRef<typeof OrbitControls>>(null);const {camera,invalidate}=useThree();const desiredCamera=useRef(DEFAULT_CAMERA.clone());const desiredTarget=useRef(DEFAULT_TARGET.clone());const animating=useRef(true);const previousReset=useRef(resetToken)
 useEffect(()=>{if(selected){const point=getLocationWorldPoint(layout,selected);desiredTarget.current.set(point.x,point.y,point.z);desiredCamera.current.set(point.x+5,Math.max(point.y+3.2,4.2),point.z+5);animating.current=true}else if(previousReset.current!==resetToken){desiredCamera.current.copy(DEFAULT_CAMERA);desiredTarget.current.copy(DEFAULT_TARGET);animating.current=true}previousReset.current=resetToken;invalidate()},[layout,selected,resetToken,invalidate])
 useFrame(()=>{if(!animating.current||!controlsRef.current)return;camera.position.lerp(desiredCamera.current,.1);controlsRef.current.target.lerp(desiredTarget.current,.12);controlsRef.current.update();if(camera.position.distanceTo(desiredCamera.current)<.04&&controlsRef.current.target.distanceTo(desiredTarget.current)<.04)animating.current=false;else invalidate()})
 return<OrbitControls ref={controlsRef} makeDefault enableDamping enablePan screenSpacePanning dampingFactor={.08} minDistance={2} maxDistance={140} maxPolarAngle={Math.PI/2.01} onStart={()=>{animating.current=false}}/>
}

export function WarehouseScene({layout,locations,selectedAddress,visibleStatuses,mode,routePlan,routeRunToken,cameraResetToken,onSelect}:{layout:WarehouseLayout;locations:WarehouseLocation[];selectedAddress:string|null;visibleStatuses:Record<SlotStatus,boolean>;mode:RenderMode;routePlan:RoutePlan|null;routeRunToken:number;cameraResetToken:number;onSelect:(address:string|null)=>void}){
 const visibleLocations=useMemo(()=>locations.filter(location=>visibleStatuses[location.status]),[locations,visibleStatuses]);const selected=locations.find(location=>location.address===selectedAddress)
 const linePoints=routePlan?.points.map(point=>[point.x,.09,point.z] as [number,number,number])??[]
 return<Canvas frameloop="demand" shadows={mode==='realistic'} dpr={[1,1.45]} camera={{position:[DEFAULT_CAMERA.x,DEFAULT_CAMERA.y,DEFAULT_CAMERA.z],fov:46,near:.1,far:260}} onPointerMissed={()=>onSelect(null)}>
  <color attach="background" args={[mode==='operational'?'#f4f7fa':'#111820']}/><fog attach="fog" args={[mode==='operational'?'#f4f7fa':'#111820',60,170]}/>
  <ambientLight intensity={mode==='operational'?1.4:.55}/><hemisphereLight args={[mode==='operational'?'#ffffff':'#eef6ff',mode==='operational'?'#cbd5e1':'#1f2937',1.1]}/><directionalLight position={[24,32,18]} intensity={mode==='operational'?1.4:2.2} castShadow={mode==='realistic'} shadow-mapSize-width={2048} shadow-mapSize-height={2048}/>
  <FloorAndZones layout={layout} mode={mode}/><RackInstances layout={layout} mode={mode}/><SlotInstances layout={layout} locations={visibleLocations} selectedAddress={selectedAddress} onSelect={address=>onSelect(address)}/><AisleLabels layout={layout}/>
  {linePoints.length>1&&<Line points={linePoints} color="#2563eb" lineWidth={3} dashed dashSize={.55} gapSize={.28}/>}<Forklift plan={routePlan} runToken={routeRunToken}/><CameraRig layout={layout} selected={selected} resetToken={cameraResetToken}/>
 </Canvas>
}
