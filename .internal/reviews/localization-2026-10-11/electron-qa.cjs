const {app,BrowserWindow,Menu}=require("electron")
const fs=require("node:fs/promises")
const path=require("node:path")
const output=path.join(require("node:path").resolve(__dirname,"../../.."),".internal/reviews/localization-2026-10-11/ui-evidence")
const locales=process.env.QA_LOCALES?.split(",") || ["en","zh-TW","zh-CN","ja","ko","fr","de","id","it","pt-BR","ru","es","tr","vi"]
const delay=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))
app.setPath("userData",path.join(output,"profile"))
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:420,height:900,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false}})
 const failures=[]
 win.webContents.on("console-message",(_event,details)=>{if(details.level === "error") failures.push(details.message)})
 try {
  await fs.mkdir(output,{recursive:true})
  await win.loadURL("http://127.0.0.1:5173/qa-localization.html")
  const pick = async (index, label) => {
   await win.webContents.executeJavaScript(`document.querySelectorAll('[role="combobox"]')[${index}].click()`)
   await delay(150)
   const options = await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="option"]')).map(el=>el.textContent.trim())`)
   if(options.length !== 15 || !options.includes(label)) throw Error("Language options missing: "+JSON.stringify(options))
   await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="option"]')).find(el=>el.textContent.trim()===${JSON.stringify(label)}).click()`)
   await delay(150)
  }
  const labels=require("../../../desktop/shared/locales.json").labels
  await pick(1,labels.ja)
  await pick(0,labels.fr)
  const selection=await win.webContents.executeJavaScript(`({locale:document.querySelector('[data-testid="active-locale"]').textContent,conversation:document.querySelectorAll('[role="combobox"]')[1].textContent.trim()})`)
  if(selection.locale!=="fr"||selection.conversation!==labels.ja)throw Error("Selectors are not independent: "+JSON.stringify(selection))
  const {createNativeLocalizer,localizeMenuTemplate}=require("../../../desktop/packages/electron/src/native-localization")
  const nativeResults=[]
  for(const locale of locales){
   const t=createNativeLocalizer(()=>locale)
   const menu=Menu.buildFromTemplate(localizeMenuTemplate([{label:"Settings",accelerator:"Cmd+,"},{label:"Edit",submenu:[{role:"undo"},{role:"hideOthers"},{role:"togglefullscreen"}]}],t))
   if(menu.items[0].label!==t("Settings")||menu.items[1].submenu.items[0].label!==t("Undo")||menu.items[1].submenu.items[1].label!==t("Hide Others"))throw Error("Native menu localization failed: "+locale)
   nativeResults.push({locale,label:menu.items[0].label,undo:menu.items[1].submenu.items[0].label,hideOthers:menu.items[1].submenu.items[1].label})
  }
  const results=[]
  for(const locale of locales){
   await win.webContents.executeJavaScript(`document.querySelector('[data-locale="${locale}"]').click()`)
   const deadline=Date.now()+10000
   while(await win.webContents.executeJavaScript(`document.querySelector('[data-testid="active-locale"]')?.textContent`) !== locale){if(Date.now()>deadline)throw Error("Locale failed to load: "+locale);await delay(50)}
   await delay(150)
   const dimensions=await win.webContents.executeJavaScript(`({locale:document.documentElement.lang,dir:document.documentElement.dir,overflow:document.body.scrollWidth>innerWidth,heading:document.querySelector('h3').textContent,selects:document.querySelectorAll('[role="combobox"]').length})`)
   if(dimensions.locale!==locale||dimensions.overflow||dimensions.selects!==2)throw Error("Invalid layout "+JSON.stringify(dimensions))
   results.push(dimensions)
   await fs.writeFile(path.join(output,locale+".png"),(await win.webContents.capturePage()).toPNG())
  }
  await win.webContents.executeJavaScript(`document.querySelector('[data-locale="en"]').click()`)
  await delay(150)
  await win.webContents.executeJavaScript(`document.querySelector('[data-testid="expand"]').click()`)
  await delay(150)
  const expanded=await win.webContents.executeJavaScript(`({overflow:document.body.scrollWidth>innerWidth,heading:document.querySelector('h3').textContent})`)
  if(expanded.overflow)throw Error("Expanded labels overflow")
  await fs.writeFile(path.join(output,"expanded.png"),(await win.webContents.capturePage()).toPNG())
  if(failures.length)throw Error(JSON.stringify(failures))
  await fs.writeFile(path.join(output,"result.json"),JSON.stringify({surface:"Electron 42 offscreen fixture using production LanguageSettings and I18nProvider",width:420,selectorInteraction:selection,nativeMenus:nativeResults,locales:results,expanded,errors:failures},null,2).replace(/[\u007f-\uffff]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"))+"\n")
  console.log("Electron locale and expanded-label rendering passed: "+locales.length)
 }catch(error){console.error(error);process.exitCode=1}finally{win.destroy();app.exit(process.exitCode || 0)}
})
