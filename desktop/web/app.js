'use strict';
const $=id=>document.getElementById(id);
const CLIENT_BUILD='2026.10.10.1';
let key=sessionStorage.getItem('curbsentry-key')||'', state=null, selected=null, formContext={}, urls=[];
let refreshTask=null, sessionVersion=0, reviewVersion=0, reviewAbort=null, formUrl=null;
let pendingFile=null,lastUpload=null,ocrDiagnostics=null;
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('key')){key=fragment.get('key');sessionStorage.setItem('curbsentry-key',key);history.replaceState(null,'',location.pathname);}
function el(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function button(text,action,className){const b=el('button',text,className);b.type='button';b.addEventListener('click',()=>Promise.resolve(action()).catch(error=>message(error.message,true)));return b;}
function message(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';$('message').hidden=false;}
function localValue(iso){const d=iso?new Date(iso):new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19);}
function offsetISO(value){const d=new Date(value);if(Number.isNaN(d.getTime()))throw Error('Enter a valid capture time.');const off=-d.getTimezoneOffset(),sign=off<0?'-':'+';const pad=n=>String(Math.abs(n)).padStart(2,'0');return value+sign+pad(Math.floor(Math.abs(off)/60))+':'+pad(Math.abs(off)%60);}
function when(iso){return new Date(iso).toLocaleString();}
function vehicleName(v){return v.plate||v.label||Object.values(v.description||{}).filter(Boolean).join(' ')||'Unidentified vehicle';}
async function api(path,data){const response=await fetch(path,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+key,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});const value=await response.json();if(!response.ok)throw Error(value.error||'Request failed.');return value;}
async function blob(path,signal){const r=await fetch(path,{headers:{Authorization:'Bearer '+key},signal});if(!r.ok){const value=await r.json();throw Error(value.error||'File unavailable.');}return r.blob();}
async function refresh(fresh=false){
 if(refreshTask){await refreshTask;if(!fresh)return;return refresh(true);}
 if(!key){$('unlock').hidden=false;$('workspace').hidden=true;return;}
 const version=sessionVersion,authKey=key;
 const task=(async()=>{try{const data=await api('/api/state');if(version!==sessionVersion||authKey!==key)return;state=data;$('unlock').hidden=true;$('workspace').hidden=false;$('connection').textContent='Private · connected';render();}catch(e){if(version!==sessionVersion||authKey!==key)return;if(!state){$('unlock').hidden=false;$('workspace').hidden=true;}$('connection').textContent='Disconnected';message(e.message,true);}})();
 refreshTask=task;try{await task;}finally{if(refreshTask===task)refreshTask=null;}
}
function clearReview(keepVideo=false){
 const target=$('review'),video=keepVideo?target.querySelector('video'):null,keepUrl=video?.getAttribute('src');
 reviewVersion++;reviewAbort?.abort();reviewAbort=new AbortController();
 target.querySelectorAll('video').forEach(v=>{if(v!==video){v.pause();v.removeAttribute('src');v.load();}});
 for(const u of urls)if(u!==keepUrl)URL.revokeObjectURL(u);urls=keepUrl?[keepUrl]:[];
 target.replaceChildren();return video;
}
function clearFormPreview(){if(formUrl)URL.revokeObjectURL(formUrl);formUrl=null;$('framePreview').hidden=true;$('observationFrame').removeAttribute('src');$('fullFrame').removeAttribute('href');}
function uploadStatus(text,error=false){$('uploadStatus').textContent=text;$('uploadStatus').className=error?'warning':'note';}
function showFilePreview(file){
 pendingFile=file||null;selected=null;clearReview();const target=$('review');delete target.dataset.clipId;target.dataset.status='preview';
 document.querySelectorAll('.clip').forEach(b=>b.classList.toggle('selected',false));
 if(!file){target.append(el('p','Choose a recording to preview it.','note'));uploadStatus('No recording selected.');return;}
 target.append(el('h2',file.name),el('p','Selected file · '+(file.size/1024/1024).toFixed(1)+' MiB · Not saved yet','meta'));
 if(file.size>200*1024*1024){uploadStatus('Choose a recording smaller than 200 MiB.',true);target.append(el('p','This file is too large to upload.','warning'));return;}
 if(!/\.(mp4|mov|m4v|webm|avi)$/i.test(file.name)){uploadStatus('Choose an MP4, MOV, M4V, WebM or AVI recording.',true);return;}
 const u=URL.createObjectURL(file);urls.push(u);const video=el('video');video.controls=true;video.preload='metadata';video.src=u;
 video.addEventListener('error',()=>{if(target.querySelector('video')!==video)return;if(pendingFile===file)uploadStatus('Your browser could not play this file. It has not been saved yet; uploading can still prepare review frames.',true);else if(selected)message('Your browser could not play this saved recording. Use its review frames or open the original file in your video player.',true);});
 target.prepend(video);target.append(el('p','Enter the recording start time and camera name, then choose Upload & review to save and process this file.','note'));uploadStatus('Selected '+file.name+'. Not saved yet.');
}
function tab(name){document.querySelectorAll('.tab').forEach(s=>s.hidden=s.id!==name);document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('selected',b.dataset.tab===name));}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$('unlockForm').onsubmit=async e=>{e.preventDefault();sessionVersion++;key=$('key').value.trim();sessionStorage.setItem('curbsentry-key',key);await refresh(true);};
$('lock').onclick=()=>{sessionVersion++;key='';state=null;sessionStorage.removeItem('curbsentry-key');clearReview();selected=null;pendingFile=null;lastUpload=null;delete $('review').dataset.clipId;delete $('review').dataset.status;$('workspace').hidden=true;$('unlock').hidden=false;$('connection').textContent='Locked';formContext={};$('observation').close();clearFormPreview();uploadStatus('No recording selected.');};
$('capture').value=localValue();
$('file').onchange=()=>showFilePreview($('file').files[0]);
$('uploadForm').noValidate=true;
$('uploadForm').onsubmit=async e=>{
 e.preventDefault();const file=$('file').files[0];if(!file){uploadStatus('Choose a recording first.',true);return;}if($('uploadButton').disabled)return;
 if(pendingFile!==file)showFilePreview(file);const version=sessionVersion,view=reviewVersion;
 const attempt={file_name:file.name,size_bytes:file.size,started:new Date().toISOString(),status:'validating',http_status:null};lastUpload=attempt;
 $('uploadButton').disabled=true;
 try{
  if(file.size>200*1024*1024)throw Error('Choose a recording smaller than 200 MiB.');
  if(!/\.(mp4|mov|m4v|webm|avi)$/i.test(file.name))throw Error('Choose an MP4, MOV, M4V, WebM or AVI recording.');
  const camera=$('camera').value.trim();if(!camera)throw Error('Enter the camera name, then upload this recording.');
  const query=new URLSearchParams({name:file.name,capture_iso:offsetISO($('capture').value),camera});
  attempt.status='uploading';uploadStatus('Uploading '+file.name+'…');
  const r=await fetch('/api/upload?'+query,{method:'POST',headers:{Authorization:'Bearer '+key},body:file});attempt.http_status=r.status??null;
  const value=await r.json();if(version!==sessionVersion)return;if(!r.ok)throw Error(value.error||'The upload was rejected.');
  if(!/^[a-f0-9]{32}$/.test(value.id||''))throw Error('The upload returned an invalid recording identifier.');
  attempt.status=value.duplicate?'duplicate':'saved';attempt.recording_id=value.id;attempt.duplicate=Boolean(value.duplicate);
  const stillSelected=pendingFile===file&&reviewVersion===view;
  if(stillSelected)await review(value.id,file);
  const notice=value.duplicate?'This file matches a recording already in your library. No additional sighting was counted.':'Saved '+file.name+'. Processing runs separately; confirm vehicles after reviewing.';
  uploadStatus(stillSelected?notice:'Saved '+file.name+'. Your current preview was kept.');message(notice);
  await refresh(true);if(version!==sessionVersion)return;
  if(stillSelected&&selected===value.id)await review(value.id);
  if($('file').files[0]===file)$('file').value='';
 }catch(e){if(version===sessionVersion){attempt.status_before_failure=attempt.status;attempt.status='failed';attempt.error=e.message;const notice=attempt.status_before_failure==='validating'?'Upload failed: '+e.message+' This file has not been saved.':'Upload not confirmed: '+e.message+' Check the recording library before retrying.';uploadStatus(notice,true);message(notice,true);}}
 finally{$('uploadButton').disabled=false;}
};
function render(){
 $('build').textContent='Build '+CLIENT_BUILD+(state.build===CLIENT_BUILD?'':'; service '+(state.build||'version unavailable'));
 $('tools').textContent='FFmpeg: '+(state.tools.ffmpeg?'available':'not found')+' · ffprobe: '+(state.tools.ffprobe?'available':'not found')+' · OCR: '+(state.tools.tesseract?'executable found; check reader in Settings':'NOT RUNNING: configure Tesseract')+' · Maximum recording length: 10 minutes';
 $('alertCount').textContent=state.alerts.filter(a=>!a.acknowledged).length;
 const clips=$('clips');clips.replaceChildren();if(!state.clips.length)clips.append(el('p','No recordings yet.'));
 for(const c of state.clips){const b=button('',()=>review(c.id),'clip'+(selected===c.id?' selected':''));b.append(el('strong',c.name),el('small',when(c.capture_iso)+' · '+c.camera),el('span',c.status,'pill'));clips.append(b);}
 const events=$('events');events.replaceChildren();if(!state.sightings.length)events.append(el('div','No confirmed sightings yet. Upload a clip or log a manual sighting.','card empty'));
 for(const s of state.sightings){const v=state.vehicles.find(v=>v.id===s.vehicle_id);const row=el('article',undefined,'record'),body=el('div'),actions=el('div',undefined,'actions');body.append(el('strong',vehicleName(v)),el('p',when(s.capture_iso)+' · '+s.camera),el('p',s.note||Object.values(v.description).filter(Boolean).join(' · ')));body.append(el('span',v.known?'Known · excluded from alerts':s.included?'Counts toward repeat rules':'Excluded from repeat counts','pill'));actions.append(button('Edit',()=>openForm({sighting:s})),button(v.known?'Restore tracking':'Ignore vehicle',async()=>{await api('/api/known',{vehicle_id:v.id,known:!v.known,label:v.label});await refresh();}));if(s.clip_id)actions.append(button('Recording',()=>{tab('recordings');return review(s.clip_id);}));row.append(body,actions);events.append(row);}
 const vehicles=$('vehicles');vehicles.replaceChildren();const known=state.vehicles.filter(v=>v.known);if(!known.length)vehicles.append(el('div','Add household or neighbor vehicles to your ignore list.','card empty'));
 for(const v of known){const row=el('article',undefined,'record'),body=el('div');body.append(el('strong',vehicleName(v)),el('p',[v.label,...Object.values(v.description)].filter(Boolean).join(' · ')));row.append(body,button('Restore tracking',async()=>{await api('/api/known',{vehicle_id:v.id,known:false,label:v.label});await refresh();}));vehicles.append(row);}
 const alerts=$('alertsList');alerts.replaceChildren();if(!state.alerts.length)alerts.append(el('div','No confirmed repeat-sighting alerts.','card empty'));
 for(const a of state.alerts){const row=el('article',undefined,'record alert'),body=el('div'),actions=el('div',undefined,'actions');body.append(el('strong',vehicleName(a)),el('p',a.count+' confirmed sightings within '+a.window_hours+' hours · '+when(a.capture_iso)),el('p',a.cameras.join(' · ')),el('span',a.acknowledged?'Reviewed':'Needs review','pill'));actions.append(button('View sightings',()=>tab('sightings')));if(!a.acknowledged)actions.append(button('Mark reviewed',async()=>{await api('/api/ack',{id:a.id});await refresh();}));row.append(body,actions);alerts.append(row);}
 if(document.activeElement.closest('#settingsForm')===null){for(const k of ['repeat_count','window_hours','bus_count','bus_start','bus_end'])$(k).value=state.settings[k];$('bus_enabled').checked=state.settings.bus_enabled;document.querySelectorAll('#weekdays input').forEach(e=>e.checked=state.settings.bus_days.includes(Number(e.value)));}
 if(selected){const c=state.clips.find(c=>c.id===selected);if(c&&($('review').dataset.clipId!==c.id||$('review').dataset.status!==c.status||(['queued','processing'].includes(c.status)&&$('review').dataset.readCount!==String(c.candidates.length))))review(selected).catch(e=>message(e.message,true));}
}
async function review(id,uploadedFile=null){
 const target=$('review'),keepVideo=(selected===id&&target.dataset.clipId===id)||(uploadedFile&&pendingFile===uploadedFile);selected=id;pendingFile=null;
 const video=clearReview(keepVideo),version=reviewVersion,signal=reviewAbort.signal;
 const current=()=>selected===id&&reviewVersion===version&&!signal.aborted;
 target.dataset.clipId=id;const c=state?.clips.find(c=>c.id===id);target.dataset.status=c?.status||'';target.dataset.readCount=String(c?.candidates.length??0);
 document.querySelectorAll('.clip').forEach((b,i)=>b.classList.toggle('selected',state?.clips[i]?.id===selected));
 if(!c){if(uploadedFile)target.append(el('h2',uploadedFile.name));if(video)target.prepend(video);target.append(el('p','Recording saved. Loading its details; reconnect if the service is unavailable.','note'));return;}
 const title=el('h2',c.name),meta=el('p',when(c.capture_iso)+' · '+c.camera,'meta');target.append(title,meta);if(video)target.prepend(video);if(c.error)target.append(el('p',c.error,'warning'));
 const actions=el('div',undefined,'review-actions');actions.append(button('Confirm vehicle',()=>openForm({clip:c}),'primary'));if(['queued','processing'].includes(c.status))actions.append(button('Cancel processing',async()=>{await api('/api/cancel',{id});await refresh(true);}));if(['error','cancelled','interrupted','needs_ocr'].includes(c.status))actions.append(button('Retry processing',async()=>{await api('/api/retry',{id});await refresh(true);}));
 const loadVideo=button('Load original video',async()=>{if(loadVideo.disabled||!current())return;loadVideo.disabled=true;try{const ext=c.name.split('.').pop().toLowerCase();const data=await blob('/media/'+id+'/original.'+ext,signal);if(!current())return;const previous=target.querySelector('video');if(previous)return;const u=URL.createObjectURL(data);urls.push(u);const v=el('video');v.controls=true;v.preload='metadata';v.src=u;v.addEventListener('error',()=>{if(current())message('Your browser could not play this recording. Use its review frames or open the original file in your video player.',true);});target.prepend(v);loadVideo.textContent='Original video loaded';}catch(e){if(current())throw e;}finally{if(current())loadVideo.disabled=Boolean(target.querySelector('video'));}});
 if(video){loadVideo.disabled=true;loadVideo.textContent='Original video loaded';}actions.append(loadVideo);target.append(actions);
 if(!['queued','processing'].includes(c.status))target.append(scanAreaForm(c));
 if(c.candidates.length){target.append(el('h2','Automatically saved plate reads'),el('p','Unconfirmed reads are saved once per recording. Review them before they become sightings or Strident alerts.','note'));const candidates=el('div');for(const a of c.candidates)candidates.append(button(a.plate+' · '+a.confidence+'%',()=>openForm({clip:c,candidate:a}),'candidate'));target.append(candidates);}
 if(c.frames.length){target.append(el('h2','Review frames'),el('p','Frame times are approximate. Use the original video to check the observation offset.','note'));const frames=el('div',undefined,'frames');target.append(frames);for(const f of c.frames){const b=button('',()=>openForm({clip:c,frame:f}));const img=el('img');img.alt='Review frame at approximately '+f.offset_seconds+' seconds';b.append(img,el('small',f.offset_seconds+' sec'));frames.append(b);blob('/media/'+id+'/'+f.name,signal).then(data=>{if(!current())return;const u=URL.createObjectURL(data);urls.push(u);img.src=u;}).catch(()=>{if(current())img.alt='Frame unavailable';});}}
 else target.append(el('p',['queued','processing'].includes(c.status)?'Processing this recording. You can review the original video while frames are prepared.':'No frames are available. Review the original video or retry processing.','note'));
 document.querySelectorAll('.clip').forEach((b,i)=>b.classList.toggle('selected',state.clips[i]?.id===selected));
}
function scanAreaForm(c){
 const details=el('details'),summary=el('summary','Rescan plate area'),form=el('form',undefined,'scan-area'),hint=el('p','Crop around the area where the plate passes. Existing videos, review frames and confirmed sightings are retained. Use plate-only reading only for a close crop around one plate.','note');details.append(summary,hint,form);
 const values=c.scan_options||{x:0,y:0,width:100,height:100,plate_only:false},inputs={};
 for(const [name,title] of [['x','Left %'],['y','Top %'],['width','Width %'],['height','Height %']]){const label=el('label',title),input=el('input');input.type='number';input.min=name==='width'||name==='height'?'1':'0';input.max='100';input.step='0.1';input.required=true;input.value=values[name];input.name=name;inputs[name]=input;label.append(input);form.append(label);}
 const label=el('label',undefined,'check'),only=el('input');only.type='checkbox';only.checked=values.plate_only;label.append(only,document.createTextNode('Plate-only reading (close crop)'));form.append(label);
 const submit=el('button','Rescan and save reads','primary');submit.type='submit';form.append(submit);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{const options={plate_only:only.checked};for(const name of ['x','y','width','height'])options[name]=Number(inputs[name].value);await api('/api/retry',{id:c.id,scan_options:options});message('OCR rescan queued. Previously saved sightings and original frames retained.');await refresh(true);}catch(error){message(error.message,true);}finally{submit.disabled=false;}};return details;
}
function fillVehicle(v){for(const k of ['plate','label','make','model','year','color'])$(k).value=(v?.description?.[k]??v?.[k]??'');}
$('vehicle').onchange=()=>fillVehicle(state.vehicles.find(v=>v.id===$('vehicle').value));
function openForm(context={}){formContext=context;$('observationForm').reset();const s=context.sighting, c=context.clip||(s?.clip_id?state.clips.find(c=>c.id===s.clip_id):null);if(c)formContext.clip=c;const known=context.known;$('formTitle').textContent=known?'Add a known vehicle':s?'Edit observation':'Confirm a sighting';$('saveObservation').textContent=known?'Add to ignore list':'Save observation';$('manualFields').hidden=Boolean(c||known);$('offsetLabel').hidden=!c||known;for(const id of ['noteLabel','includeLabel','confirmLabel','vehicleLabel'])$(id).hidden=Boolean(known);$('vehicle').replaceChildren(el('option','New vehicle'));$('vehicle').options[0].value='';for(const v of state.vehicles){const o=el('option',vehicleName(v)+(v.known?' · known':''));o.value=v.id;$('vehicle').append(o);}if(s){$('vehicle').value=s.vehicle_id;fillVehicle(state.vehicles.find(v=>v.id===s.vehicle_id));$('note').value=s.note;$('offset').value=s.offset_seconds;$('included').checked=Boolean(s.included);$('eventCapture').value=localValue(s.capture_iso);$('eventCamera').value=s.camera;}else{$('eventCapture').value=localValue();$('eventCamera').value=$('camera').value;$('included').checked=true;}$('offset').value=context.frame?.offset_seconds??context.candidate?.offset_seconds??s?.offset_seconds??0;if(context.candidate)$('plate').value=context.candidate.plate;$('confirmed').checked=false;$('formHint').textContent='Record only what you can verify. Descriptions and approximate years are entered by you.';$('framePreview').hidden=true;$('observationFrame').removeAttribute('src');$('fullFrame').removeAttribute('href');$('observation').showModal();
 const frame=context.frame||c?.frames.find(f=>f.name===(context.candidate?.frame||s?.frame));
 clearFormPreview();if(c&&frame)blob('/media/'+c.id+'/'+frame.name).then(data=>{if(formContext!==context||!$('observation').open)return;formUrl=URL.createObjectURL(data);$('observationFrame').src=formUrl;$('fullFrame').href=formUrl;$('framePreview').hidden=false;}).catch(e=>{if(formContext===context&&$('observation').open)$('formHint').textContent=e.message;});
}
$('observation').addEventListener('close',()=>{if(!$('observation').open){formContext={};clearFormPreview();}});
$('manual').onclick=()=>openForm();$('addKnown').onclick=()=>openForm({known:true});$('closeDialog').onclick=()=>$('observation').close();
$('observationForm').onsubmit=async e=>{e.preventDefault();try{if(!formContext.known&&!$('confirmed').checked)throw Error('Confirm that you reviewed this observation before saving.');const data={};for(const k of ['plate','label','make','model','year','color','note'])data[k]=$(k).value;data.vehicle_id=$('vehicle').value||null;data.included=$('included').checked;if(formContext.sighting)data.id=formContext.sighting.id;if(formContext.clip){data.clip_id=formContext.clip.id;data.offset_seconds=Number($('offset').value);data.frame=formContext.frame?.name||formContext.candidate?.frame||formContext.sighting?.frame||'';}else if(!formContext.known){data.capture_iso=offsetISO($('eventCapture').value);data.camera=$('eventCamera').value;}const result=await api(formContext.known?'/api/vehicle':'/api/sighting',data);$('observation').close();message(formContext.known?'Known vehicle added. It is excluded from alerts.':result.ignored?'Observation saved for review. This known vehicle is excluded from alerts.':'Confirmed observation saved. Repeat rules used its capture time.');await refresh();}catch(e){message(e.message,true);$('formHint').textContent=e.message;}};
const names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];names.forEach((name,i)=>{const label=el('label',undefined,'check'),input=el('input');input.type='checkbox';input.value=i;label.append(input,document.createTextNode(name));$('weekdays').append(label);});
$('settingsForm').onsubmit=async e=>{e.preventDefault();try{const data={bus_enabled:$('bus_enabled').checked,bus_days:[...document.querySelectorAll('#weekdays input:checked')].map(e=>Number(e.value))};for(const k of ['repeat_count','window_hours','bus_count'])data[k]=Number($(k).value);for(const k of ['bus_start','bus_end'])data[k]=$(k).value;await api('/api/settings',data);message('Repeat rules saved. Existing observations and alerts were recalculated.');await refresh();}catch(e){message(e.message,true);}};
$('backup').onclick=async()=>{const b=$('backup');b.disabled=true;try{const data=await blob('/api/backup');const u=URL.createObjectURL(data),a=el('a');a.href=u;a.download='CurbSentry_Backup.zip';a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);message('Backup download prepared. Keep it somewhere separate from this computer.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
$('checkOcr').onclick=async()=>{const b=$('checkOcr');b.disabled=true;$('ocrHealth').textContent='Checking FFmpeg, ffprobe and the actual local English OCR engine…';try{ocrDiagnostics=await api('/api/diagnostics');$('ocrHealth').textContent=ocrDiagnostics.ready?'Automatic plate reader is available. Review accuracy on your footage.':Object.entries(ocrDiagnostics.checks).filter(([,v])=>!v.ok).map(([name,v])=>name+': '+v.message).join(' ');}catch(e){$('ocrHealth').textContent=e.message;}finally{b.disabled=false;}};
$('diagnostics').onclick=()=>{const report={client_build:CLIENT_BUILD,service_build:state?.build||null,browser:globalThis.navigator?.userAgent||'unavailable',recording_count:state?.clips.length??null,video_tools:state?.tools||null,ocr_check:ocrDiagnostics,recording_status:state?.clips.map(c=>({id:c.id,status:c.status,error:c.error,frames:c.frames.length,reads:c.candidates.length,scan_options:c.scan_options}))||[],selected_recording:selected,pending_file:pendingFile?{name:pendingFile.name,size_bytes:pendingFile.size}:null,last_upload:lastUpload};const u=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=u;a.download='CurbSentry_Upload_Diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);message('Upload diagnostics downloaded. No access keys or video contents are included.');};
refresh();setInterval(()=>{if(key&&!document.hidden&&!$('observation').open)refresh();},5000);
