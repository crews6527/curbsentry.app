// Exercise the actual desktop service, native OCR and read-only Strident queue.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const root=await mkdtemp(join(tmpdir(),'curb-desktop-test-'));
const output=resolve('test-results/desktop-service');
await mkdir(output,{recursive:true});
const base='http://127.0.0.1:8778';
const python=process.env.CURBSENTRY_PYTHON||'python3';
const server=spawn(python,[resolve('desktop/main.py'),'--data',root,'--port','8778','--no-browser'],{stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
let browser;
const checks=[],errors=[],external=[];
try{
 let ready=false;
 for(let i=0;i<100;i++){try{ready=(await fetch(base)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
 assert(ready,log);
 const config=JSON.parse(await readFile(join(root,'config.json'),'utf8'));
 const api=async(path,data,reader=false)=>{
  const response=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+(reader?config.read_token:config.owner_token),...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});
  assert(response.ok,await response.clone().text());return response.json();
 };
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.CURBSENTRY_CHROMIUM?{executablePath:process.env.CURBSENTRY_CHROMIUM}:{})});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base+'/'))external.push(r.url());});
 await page.goto(base+'/#key='+config.owner_token);
 await page.locator('#workspace').waitFor({state:'visible'});
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Check automatic plate reader'}).click();
 await page.getByText('Automatic plate reader is available.',{exact:false}).waitFor();
 checks.push('actual FFmpeg, ffprobe, Tesseract and bundled English model initialize');
 await page.getByRole('button',{name:'Recordings',exact:true}).click();
 const fixture=resolve('test-results/fixtures/plate.mp4');
 const upload=async(file,time)=>{
  await page.locator('#file').setInputFiles(file);
  await page.locator('#capture').fill(time);await page.locator('#camera').fill('Synthetic camera');
  await page.getByRole('button',{name:'Upload & review',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#review').dataset.status==='ready',null,{timeout:120000});
  return (await api('/api/state')).clips[0];
 };
 let clip=await upload(fixture,'2026-10-01T10:00');
 assert(clip.candidates.some(c=>c.plate==='TEST428'),JSON.stringify(clip));
 assert.equal((await api('/api/state')).sightings.length,0);
 await page.getByRole('heading',{name:'Automatically saved plate reads',exact:true}).waitFor();
 checks.push('uploaded MP4 automatically produces persistent unconfirmed TEST428 without invented sightings');
 const frame=clip.frames[0];
 const frameBefore=await fetch(base+'/media/'+clip.id+'/'+frame.name,{headers:{Authorization:'Bearer '+config.owner_token}}).then(r=>r.arrayBuffer());
 await page.getByRole('button',{name:/^TEST428 ·/}).click();
 await page.locator('#plate').fill('TEST429');await page.locator('#confirmed').check();
 await page.getByRole('button',{name:'Save observation',exact:true}).click();
 await page.locator('#observation').waitFor({state:'hidden'});
 const sighting=(await api('/api/state')).sightings[0];
 assert.equal((await api('/api/state')).vehicles[0].plate,'TEST429');
 assert.equal(sighting.clip_id,clip.id);
 assert(Math.abs(new Date(sighting.capture_iso).getTime()-new Date(clip.capture_iso).getTime()-sighting.offset_seconds*1000)<1);
 checks.push('reviewed correction retains original recording timestamp and offset');
 await page.getByText('Rescan plate area',{exact:true}).click();
 // Clear-text test fixture places the plate at x=100,y=140 in a 1280x720 frame.
 for(const [name,value] of [['x','5'],['y','16'],['width','40'],['height','20']])await page.locator('.scan-area input[name="'+name+'"]').fill(value);
 await page.getByLabel('Plate-only reading (close crop)',{exact:true}).check();
 await page.getByRole('button',{name:'Rescan and save reads'}).click();
 await page.waitForFunction(()=>document.querySelector('#review').dataset.status==='ready',null,{timeout:120000});
 let saved=await api('/api/state');clip=saved.clips[0];
 assert(clip.scan_options.plate_only);assert(clip.candidates.some(c=>c.plate==='TEST428'));
 assert.equal(saved.sightings.length,1);assert.equal(saved.sightings[0].id,sighting.id);
 const frameAfter=await fetch(base+'/media/'+clip.id+'/'+frame.name,{headers:{Authorization:'Bearer '+config.owner_token}}).then(r=>r.arrayBuffer());
 assert.deepEqual(Buffer.from(frameAfter),Buffer.from(frameBefore));
 checks.push('focused rescan preserves evidence bytes and confirmed records without duplicate sightings');
 const bytes=await readFile(fixture);
 await upload({name:'renamed.mp4',mimeType:'video/mp4',buffer:bytes},'2026-10-01T10:00');
 assert.equal((await api('/api/state')).clips.length,1);
 checks.push('renamed duplicate preserves one recording');
 await page.reload();await page.locator('#workspace').waitFor({state:'visible'});
 assert.equal((await api('/api/state')).sightings.length,1);
 checks.push('saved reads and corrections survive a browser reload');
 await api('/api/settings',{repeat_count:3,window_hours:2,bus_enabled:false,bus_count:2,bus_start:'14:30',bus_end:'16:00',bus_days:[0,1,2,3,4]});
 for(const minutes of [10,20])await api('/api/sighting',{plate:'TEST429',capture_iso:new Date(new Date(clip.capture_iso).getTime()+minutes*60000).toISOString(),camera:'Synthetic camera'});
 const alerts=await api('/api/alerts',undefined,true);assert.equal(alerts.alerts.length,1);
 assert.equal(alerts.alerts[0].plate,'TEST429');assert.equal(alerts.alerts[0].count,3);
 const denied=await fetch(base+'/api/state',{headers:{Authorization:'Bearer '+config.read_token}});assert.equal(denied.status,403);
 await api('/api/ack',{id:alerts.alerts[0].id});assert.equal((await api('/api/alerts',undefined,true)).alerts.length,0);
 checks.push('read-only Strident queue receives confirmed repeat alert, denies database access and removes reviewed alert');
 await page.getByRole('button',{name:'Recordings',exact:true}).click();
 await page.locator('#clips button').first().click();
 await page.screenshot({path:join(output,'desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(output,'mobile.png'),fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 checks.push('mobile layout has no horizontal overflow');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 checks.push('no page errors or external HTTP requests');
 const result={ok:true,checks,errors,external,testedAt:new Date().toISOString()};
 await writeFile(join(output,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){
 if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:join(output,'failure.png'),fullPage:true});console.error(await page.locator('body').innerText());}}
 console.error(log);throw error;
}finally{
 await browser?.close();server.kill('SIGINT');await new Promise(r=>server.once('exit',r));await rm(root,{recursive:true,force:true});
}
