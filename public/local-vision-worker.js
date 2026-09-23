import {
  load_image,
  pipeline,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1/+esm";

class LocalVision {
  static classifier = null;

  static async getClassifier(progress_callback=null){
    if(!this.classifier){
      try{
        this.classifier=await pipeline("image-classification","Xenova/mobilevit-xx-small",{dtype:"q8",progress_callback});
      }catch{
        this.classifier=await pipeline("image-classification","Xenova/mobilevit-xx-small",{progress_callback});
      }
    }
    return this.classifier;
  }
}

async function load(){
  self.postMessage({status:"loading"});
  try{
    await LocalVision.getClassifier((x)=>self.postMessage(x));
    self.postMessage({status:"ready",mode:"classifier"});
  }catch(e){
    self.postMessage({status:"error",data:String(e?.message||e)});
  }
}

async function classify(imageUrl){
  const classifier=await LocalVision.getClassifier((x)=>self.postMessage(x));
  const image=await load_image(imageUrl);
  const output=await classifier(image,{topk:5});
  const ranked=Array.isArray(output)?output:[];
  const best=ranked[0]||{};
  const label=String(best.label||"").trim();
  return {
    productName:label,
    category:label,
    colors:[],
    visibleFeatures:[],
    visibleText:[],
    packageType:"",
    classifierMode:true,
    classifierCandidates:ranked.slice(0,5).map(x=>({label:String(x.label||""),score:Number(x.score||0)}))
  };
}

async function analyze(imageUrl){
  try{
    const result=await classify(imageUrl);
    self.postMessage({status:"complete",output:JSON.stringify(result),mode:"classifier"});
  }catch(e){
    self.postMessage({status:"error",data:String(e?.message||e)});
  }
}

self.addEventListener("message",(e)=>{
  const {type,image}=e.data||{};
  if(type==="load")load();
  if(type==="analyze")analyze(image);
});
