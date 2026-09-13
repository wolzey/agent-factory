import { brandingTexture, factoryIdentity } from './factory25dBranding';
import { garageElevatorPose } from './factory25dWorld';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {propPart,standard} from './factory25dProps';
import './factory25dGarage.css';
import {furnishGarage,garageConcrete} from './factory25dGarageFurnishings';
import {contactShadow} from './factory25dContactShadows';
import {createElevator,ELEVATOR_WIDTH} from './factory25dElevator';
import {elevatorTrip, floorTransitionDebug} from './factory25dElevatorTrip';
import {FACTORY_ELEVATOR,GARAGE_ELEVATOR,factoryRoomAt,fromFactoryWorld} from '@shared/factory25d-layout';
import type { WorldAgent } from '@shared/types';
import { elevatorApproachOpenness } from './factory25dManualTravel';
import { createFloorSection, floorTravelCamera, GARAGE_SECTION_X,GARAGE_SECTION_Y,upperFloorLift } from './factory25dFloorTransition';
import { GARAGE_CAR_BAYS, GARAGE_CAR_SCALE, GARAGE_CAR_YAW, GARAGE_RAMP, type GarageCarId } from '@shared/factory25d-garage';
import { createGarageCarAnimation } from './factory25dGarageCarAnimation';
import { createMiniWorkstation } from './factory25dMiniWork';
import { createGarageLighting } from './factory25dGarageLighting';
import type { SceneLightSwitch } from './factory25dLightSwitches';
import { createGarageWindows, type GarageWindowWeather } from './factory25dGarageWindows';

const LEVEL=-12;
export function createGarage(factory:THREE.Scene,canvas:HTMLCanvasElement,home:THREE.OrthographicCamera,windowMaterial:THREE.Material,skyMaterial?:THREE.Material,cloudMaterial?:THREE.Material,windowWeather?:GarageWindowWeather){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#08091a');
 const travelBackground=new THREE.Color();
 const room=new THREE.Group();room.position.y=LEVEL;scene.add(room);
 const camera=home.clone(), lowerFloorCamera=home.clone();
 const floorSection=createFloorSection(factory);
 const previewValue=import.meta.env.DEV?new URLSearchParams(location.search).get('floorPreview'):null;
 const floorPreview=previewValue!==null&&Number.isFinite(Number(previewValue))?THREE.MathUtils.clamp(Number(previewValue),0,1):undefined;
 let floorProgress=0,physicalTrip=false;
 const trim=standard('#414b65'),dark=standard('#171d31'),paint=standard('#828a9f');
 const box=(size:[number,number,number],at:[number,number,number],mat:THREE.Material,parent:THREE.Object3D=room)=>propPart(parent,size,at,mat);
 const floorShape=new THREE.Shape();floorShape.moveTo(-12,4.6);floorShape.lineTo(12,4.6);floorShape.lineTo(12,-16.2);floorShape.lineTo(-12,-16.2);floorShape.closePath();
 const pit=new THREE.Path();pit.moveTo(5.65,-11);pit.lineTo(5.65,-16.1);pit.lineTo(11.85,-16.1);pit.lineTo(11.85,-11);pit.closePath();floorShape.holes.push(pit);
 const slab=new THREE.Mesh(new THREE.ShapeGeometry(floorShape),garageConcrete());slab.rotation.x=-Math.PI/2;slab.receiveShadow=true;room.add(slab);
 box([24,.24,.15],[0,-.12,16.22],trim);
 const lighting=createGarageLighting(room);
 const lit=standard('#ffe4b8',.7,'#ffcd85');lit.emissiveIntensity=.45;
 function label(text:string,width:number,height:number,color='#eee1c2'){
  const c=document.createElement('canvas');c.width=768;c.height=96;const ctx=c.getContext('2d')!;ctx.fillStyle='#111728';ctx.fillRect(0,0,768,96);ctx.fillStyle=color;ctx.font='bold 44px monospace';ctx.textAlign='center';ctx.textBaseline='middle';if(ctx.measureText(text).width>730)ctx.font=`bold ${Math.floor(44*730/ctx.measureText(text).width)}px monospace`;ctx.fillText(text,384,49);
  const texture=new THREE.CanvasTexture(c);texture.magFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture}));
 }
 const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.6,.42),new THREE.MeshBasicMaterial({map:brandingTexture(3.6/.42,()=>factoryIdentity().title+' · GARAGE','#080b1a')}));sign.name='factory-brand-garage-title';sign.position.set(0,3.22,-4.02);room.add(sign);
 const windows=createGarageWindows(room,windowMaterial,skyMaterial,3.598,cloudMaterial,windowWeather);
 const wallFixtures=new THREE.Group();room.add(wallFixtures);
 for(const x of [-6.25,0,6.25])box([.65,.045,.12],[x,2.96,-4.23],lit,wallFixtures);
 // Matching wall-mounted lifts connect the two floors.
 const upperLift=createElevator(factory,FACTORY_ELEVATOR.x,0,ELEVATOR_WIDTH,'01');
 const lowerLift=createElevator(room,GARAGE_ELEVATOR.x,0,ELEVATOR_WIDTH,'G');
 lowerLift.callPoint.y+=LEVEL;
 // A separate vehicle ramp occupies the right wall, away from the passenger lift.
 const rampMaterial=standard('#454958'), rampEdge=standard('#d2b574');
 const rampNear=GARAGE_RAMP.near,rampFar=GARAGE_RAMP.far,rampRise=GARAGE_RAMP.rise,rampLength=rampNear-rampFar;
 const rampShape=new THREE.Shape();rampShape.moveTo(rampFar,0);rampShape.lineTo(rampNear,0);rampShape.lineTo(rampFar,rampRise);rampShape.closePath();
 const rampGeo=new THREE.ExtrudeGeometry(rampShape,{depth:2.12,bevelEnabled:false});rampGeo.rotateY(-Math.PI/2);rampGeo.translate(11.9,0,0);
 const ramp=new THREE.Mesh(rampGeo,rampMaterial);ramp.receiveShadow=true;room.add(ramp);
 const slope=Math.atan2(rampRise,rampLength);
 for(const x of [9.79,11.84]){
  const curb=box([.14,.22,Math.hypot(rampLength,rampRise)],[x,rampRise/2+.10,(rampNear+rampFar)/2],trim);curb.rotation.x=slope;
  const stripe=box([.055,.009,Math.hypot(rampLength-.18,rampRise)],[x+(x<10?.11:-.11),rampRise/2+.019,(rampNear+rampFar)/2],rampEdge);stripe.rotation.x=slope;
 }
 box([2.17,1.67,.075],[10.85,rampRise+.835,-4.18],dark);
 for(const x of [9.67,12.03])box([.19,2.9,.3],[x,1.45,-4.04],trim);
 box([2.52,.18,.34],[10.85,2.91,-4.03],trim);
 box([.73,.035,.15],[10.85,2.64,-3.89],lit,wallFixtures);
 const rampSign=label('EXIT',.95,.23,'#a9cdbd');rampSign.position.set(10.85,3.14,-3.97);room.add(rampSign);
 // Low barrier for grounded cars; the DeLorean floats over it into the time-jump exit.
 for(const x of [9.86,11.68])box([.12,.8,.13],[x,.4,5.5],trim);
 box([1.94,.15,.09],[10.77,.64,5.5],rampEdge);
 for(const x of [10.12,10.62,11.12,11.62])box([.14,.16,.012],[x,.64,5.555],dark);
 const rampNotice=label('HOVER EXIT',1.15,.18,'#a9ddd6');rampNotice.position.set(10.77,.95,5.52);room.add(rampNotice);
 const cars=new Map<string,THREE.Group>();
 const carAnimation=createGarageCarAnimation(cars);
 const miniWork=createMiniWorkstation(room,cars);
 const ids=['porsche','mini','delorean','f1'];const names=['porsche','mini cooper','delorean','f1'];
 for(const [i,id] of ids.entries()){
  const bay=GARAGE_CAR_BAYS[id as GarageCarId],x=bay.x;
  for(const side of [-1,1]){const line=box([.04,.015,3.1],[x+side*1.15,.012,.05],paint);line.rotation.y=-.52;}
  void new GLTFLoader().loadAsync(`/prototype25d/garage/${id}.glb`).then(g=>{const root=new THREE.Group();root.name=id;root.add(g.scene);root.position.set(x,.025,bay.z);root.rotation.y=GARAGE_CAR_YAW;root.scale.setScalar(GARAGE_CAR_SCALE);root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});room.add(root);cars.set(id,root);const shadow=contactShadow(root,{width:1.25,depth:2.35,floorY:-.014,spread:.25,opacity:.35});shadow.userData.role='ground_shadow';shadow.userData.restY=shadow.position.y;}).catch(()=>{status.textContent=`${names[i]} could not load · refresh to retry`;});
 }
 const furnishings=furnishGarage(room);
 wallFixtures.add(furnishings.wallFixtures);
 const lightSwitches:SceneLightSwitch[]=[...furnishings.lightSwitches,{id:'garage-wall-lights',label:'Garage wall lights',kind:'light',target:wallFixtures.children[1],hitTargets:[wallFixtures],isOn:lighting.isInteriorOn,setOn(on){lighting.setInteriorOn(on);furnishings.setWallLightsOn(on);lit.emissiveIntensity=on?.45:0;lit.color.set(on?'#ffe4b8':'#736c60');}}];
 const down=document.createElement('button');down.className='garage-elevator-call';down.type='button';down.textContent='↓ G';down.setAttribute('aria-label','Take elevator to the garage');document.body.append(down);
 const nav=document.createElement('div');nav.className='garage-nav pixel-island';nav.hidden=true;nav.innerHTML='<button type="button" aria-label="Take elevator to the factory">↑ factory</button><span>the garage</span>';document.body.append(nav);
 const status=document.createElement('p');status.className='garage-status';status.hidden=true;document.body.append(status);
 // Keyboard and screen-reader equivalents of clicking the actual cars.
 const collection=document.createElement('div');collection.className='garage-car-access';collection.hidden=true;collection.setAttribute('aria-label','Garage cars');document.body.append(collection);
 let driveAction:((car:GarageCarId)=>void)|undefined;
 for(const [i,id] of ids.entries()){const button=document.createElement('button');button.type='button';button.textContent=`Drive or park ${names[i]}`;button.onclick=()=>driveAction?.(id as GarageCarId);collection.append(button);}
 const transit=document.createElement('div');transit.className='garage-transit';transit.hidden=true;
 const readout=document.createElement('span');readout.setAttribute('role','status');readout.setAttribute('aria-live','polite');transit.append(readout);document.body.append(transit);
 let open=false,available=true,trip:undefined|{from:boolean;to:boolean;start:number;last:number;elapsed:number;passenger:boolean};
 let walkingAgent:WorldAgent|undefined,walkingNow=0;
 let visibleCamera:THREE.Camera=home,carPickingAvailable=false;
 function visit(next:boolean,force=false){
  if(floorPreview!==undefined)return;
  if(trip){
   if(trip.passenger||trip.to===next)return;
   // Reverse the symmetric floor curve at the same position, without restarting at a floor.
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   const progress=Math.max(0,Math.min(1,(trip.elapsed/1.35-320)/890));
   trip.elapsed=reduced?0:(320+890*(1-progress))*1.35;
   trip.from=!next;trip.to=next;trip.last=performance.now();
   readout.textContent=next?'01 ↓ G':'G ↑ 01';
   return;
  }
  if(next===open||(!available&&!force))return;
  const ride=walkingAgent?.manualControl?.elevatorTrip;
  const passenger=!!ride&&(factoryRoomAt(fromFactoryWorld(ride.arrival))==='garage')===next;
  const started=performance.now();
  trip={last:started,elapsed:0,from:open,to:next,start:performance.now()-(passenger?Math.max(0,walkingNow-ride!.startedAt):0),passenger};
  nav.hidden=collection.hidden=status.hidden=down.hidden=true;transit.hidden=false;transit.style.opacity='0';
  readout.textContent=next?'01 ↓ G':'G ↑ 01';document.body.classList.add('garage-travelling');
  transit.classList.toggle('is-reduced',matchMedia('(prefers-reduced-motion: reduce)').matches);
 }
 down.onclick=()=>visit(!open);nav.querySelector('button')!.onclick=()=>visit(false);
 const skipTrip=()=>{if(trip&&!trip.passenger)trip.elapsed=2400;};
 const resumeTrip=()=>{if(trip)trip.last=performance.now();};
 document.addEventListener('visibilitychange',resumeTrip);
 window.addEventListener('factory-finish-floor-trip',skipTrip);
 const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&trip&&!trip.passenger){e.preventDefault();skipTrip();return;}if(e.key==='Escape'&&open&&!trip){e.preventDefault();visit(false);}};document.addEventListener('keydown',escape);
 const ray=new THREE.Raycaster();const select=(e:MouseEvent)=>{
  if(trip||(!available&&!carPickingAvailable)||e.button!==0||e.detail===0)return;
  // The window has a projected DOM hit area above the canvas. Resolve the
  // foreground lift before that button receives its click, using the same
  // currently displayed camera as the scene.
  if(e.target!==canvas&&!(e.target instanceof Element&&e.target.closest('#window-open')))return;
  const rect=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),visibleCamera);
  const lift=open?lowerLift.root:upperLift.root;lift.updateWorldMatrix(true,true);
  if(available&&ray.intersectObject(lift,true).length){e.preventDefault();e.stopImmediatePropagation();visit(!open);return;}
  if(!open)return;
  // Nearest visible vehicle wins, including a flying DeLorean above another car.
  for(const hit of ray.intersectObjects([...cars.values()].filter(car=>car.visible),true)){
   if(hit.object.userData.role==='ground_shadow'||!hit.object.visible)continue;
   const entry=[...cars].find(([,car])=>{let node:THREE.Object3D|null=hit.object;while(node){if(node===car)return true;node=node.parent;}return false;});
   if(entry){e.preventDefault();e.stopImmediatePropagation();driveAction?.(entry[0] as GarageCarId);break;}
  }
 };const pickHost=canvas.parentElement!;pickHost.addEventListener('click',select,true);
 return {scene,room,cars,camera,lowerFloorCamera,carAnimation,miniWork,lighting,lightSwitches,travelBackground,setDriveAction(action:(car:GarageCarId)=>void){driveAction=action;},upperFloorOffset:()=>physicalTrip?upperFloorLift(floorProgress):0,visit:(next:boolean)=>visit(next,true),setStationFeedback(states:Map<string,{active:boolean;color:string;heat:number}>){furnishings.workScreens.forEach((material,i)=>{const state=states.get(`garage-${i}`);material.emissive.set(state?.active?state.color:'#11352f');material.emissiveIntensity=state?.active ? .8+(state.heat??0)*.15 : .2;});},isActive:()=>open,isTransitioning:()=>!!trip||floorPreview!==undefined,isCrossSection:()=>physicalTrip&&floorProgress>0&&floorProgress<1,
 update(now:number,canOpen:boolean,projectionCamera:THREE.Camera=home,controlledAgent?:WorldAgent,serverNow=Date.now(),driving=false,passengers:readonly WorldAgent[]=[]){
  available=canOpen;carPickingAvailable=open&&driving;visibleCamera=projectionCamera;walkingAgent=controlledAgent;walkingNow=serverNow;
  let upperDoor=0,lowerDoor=0;
  physicalTrip=false;floorProgress=Number(open);
  if(trip){
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   // Integrate the rate each frame so dragging the slider mid-ride never jumps.
   trip.elapsed+=Math.max(0,now-trip.last)*(import.meta.env.DEV?floorTransitionDebug.speed:1);
   trip.last=now;
   const state=elevatorTrip(trip.passenger?now-trip.start:trip.elapsed,trip.from,trip.to,reduced,trip.passenger);
   open=state.garage;floorProgress=state.garage01;physicalTrip=!reduced&&!state.done;transit.style.opacity=String(state.veil);
   transit.classList.toggle('is-reduced',reduced);
   upperDoor=open?0:state.door;lowerDoor=open?state.door:0;
   document.body.classList.toggle('garage-open',open);
   if(state.done){trip=undefined;transit.hidden=true;document.body.classList.remove('garage-travelling');nav.hidden=!open;collection.hidden=!open;down.hidden=!available;if(walkingAgent?.manualControl)down.blur();else down.focus();}
  }else{
   const ride=walkingAgent?.manualControl?.elevatorTrip;
   if(ride){
    const toGarage=factoryRoomAt(fromFactoryWorld(ride.arrival))==='garage';
    const state=elevatorTrip(walkingNow-ride.startedAt,!toGarage,toGarage,false,true);
    upperDoor=state.garage?0:state.door;lowerDoor=state.garage?state.door:0;
   }else{upperDoor=elevatorApproachOpenness(walkingAgent,'factory');lowerDoor=elevatorApproachOpenness(walkingAgent,'garage');}
  }
  for(const agent of passengers){
   const pose=garageElevatorPose(agent,serverNow,'factory25d');
   upperDoor=Math.max(upperDoor,pose?.room==='factory'?pose.door:elevatorApproachOpenness(agent,'factory'));
   lowerDoor=Math.max(lowerDoor,pose?.room==='garage'?pose.door:elevatorApproachOpenness(agent,'garage'));
  }
  upperLift.update(upperDoor,!!trip);lowerLift.update(lowerDoor,!!trip);
  canvas.dataset.elevatorDoors=`${upperDoor.toFixed(2)},${lowerDoor.toFixed(2)}`;
  if(floorPreview!==undefined){physicalTrip=true;floorProgress=floorPreview;open=floorPreview>=.5;document.body.classList.toggle('garage-open',open);}
  scene.position.set(physicalTrip?GARAGE_SECTION_X:0,physicalTrip?GARAGE_SECTION_Y:0,0);
  travelBackground.copy(factory.background as THREE.Color).lerp(scene.background as THREE.Color,floorProgress);
  if(physicalTrip)travelBackground.lerp(new THREE.Color('#344454'),Math.sin(Math.PI*floorProgress)*.65);
  floorSection.root.visible=physicalTrip&&floorProgress>0&&floorProgress<1;
  down.hidden=!available||!!trip;
  nav.hidden=!open||!!trip||!available;collection.hidden=!open||!!trip||(!available&&!carPickingAvailable);if(!available)status.hidden=true;
  if(floorPreview!==undefined)down.hidden=nav.hidden=collection.hidden=true;
  const floorLabel=open?'↑ 01':'↓ G';
  if(down.dataset.label!==floorLabel){down.textContent=floorLabel;down.dataset.label=floorLabel;down.setAttribute('aria-label',open?'Take elevator to the factory':'Take elevator to the garage');}
  floorTravelCamera(camera,home,floorProgress,physicalTrip);
  floorTravelCamera(lowerFloorCamera,home,floorProgress,physicalTrip,false);
  canvas.dataset.floorProgress=floorProgress.toFixed(3);
  const rect=canvas.getBoundingClientRect();const point=(open?lowerLift.callPoint:upperLift.callPoint).clone().project(projectionCamera);
  down.style.left=`${rect.left+Math.max(8,Math.min(canvas.clientWidth-52,(point.x+1)*canvas.clientWidth/2-22))}px`;down.style.top=`${rect.top+Math.max(8,Math.min(canvas.clientHeight-52,(1-point.y)*canvas.clientHeight/2-22))}px`;
 if(open)furnishings.update(now/1000,matchMedia('(prefers-reduced-motion: reduce)').matches);
 },dispose(){sign.material.map?.dispose();sign.material.dispose();furnishings.dispose();lit.dispose();floorSection.dispose();lighting.dispose();windows.dispose();miniWork.dispose();document.body.classList.remove('garage-open','garage-travelling');upperLift.root.removeFromParent();transit.remove();down.remove();nav.remove();status.remove();collection.remove();document.removeEventListener('visibilitychange',resumeTrip);window.removeEventListener('factory-finish-floor-trip',skipTrip);document.removeEventListener('keydown',escape);pickHost.removeEventListener('click',select,true);}};
}
