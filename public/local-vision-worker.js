import {
  AutoProcessor,
  AutoModelForVision2Seq,
  load_image,
  pipeline,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1/+esm";

class LocalVision {
  static classifier = null;
  static processor = null;
  static model = null;

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

  static async getVlm(progress_callback=null){
    this.processor ??= AutoProcessor.from_pretrained("HuggingFaceTB/SmolVLM-256M-Instruct",{progress_callback});
    const hasWebGPU=Boolean(self.navigator?.gpu);
    const options=hasWebGPU
      ? {dtype:"fp32",device:"webgpu",progress_callback}
      : {dtype:"q8",progress_callback};
    this.model ??= AutoModelForVision2Seq.from_pretrained("HuggingFaceTB/SmolVLM-256M-Instruct",options);
    return Promise.all([this.processor,this.model]);
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

async function analyzeWithVlm(imageUrl){
  const [processor,model]=await LocalVision.getVlm();
  const image=await load_image(imageUrl);
  const prompt=[
    "Analyze the product in the image. Do not invent dimensions, material, power, composition, model number, brand, or technical specifications.",
    "Return ONLY valid JSON and no markdown.",
    "Use Russian language for string values when possible.",
    '{"productName":"", "category":"", "colors":[], "visibleFeatures":[], "visibleText":[], "packageType":""}',
    "visibleFeatures must contain only directly visible physical features. visibleText only text you can actually read."
  ].join(" ");
  const messages=[{role:"user",content:[{type:"image"},{type:"text",text:prompt}]}];
  const text=processor.apply_chat_template(messages,{add_generation_prompt:true});
  const inputs=await processor(text,[image],{do_image_splitting:false});
  const output=await model.generate({...inputs,do_sample:false,repetition_penalty:1.08,max_new_tokens:220});
  const sequences=typeof output?.tolist==="function"?output.tolist():null;
  const inputLength=Number(inputs?.input_ids?.dims?.at?.(-1)||0);
  if(Array.isArray(sequences?.[0])&&inputLength>0){
    return processor.tokenizer.decode(sequences[0].slice(inputLength),{skip_special_tokens:true});
  }
  const decoded=processor.batch_decode(output,{skip_special_tokens:true});
  return String(decoded?.[0]||"");
}

async function analyze(imageUrl){
  try{
    const quick=await classify(imageUrl);
    self.postMessage({status:"complete",output:JSON.stringify(quick),mode:"classifier"});
  }catch(e){
    try{
      const answer=await analyzeWithVlm(imageUrl);
      self.postMessage({status:"complete",output:String(answer||"").trim(),mode:"vlm"});
    }catch(vlmError){
      self.postMessage({status:"error",data:String(vlmError?.message||e?.message||vlmError||e)});
    }
  }
}

self.addEventListener("message",(e)=>{
  const {type,image}=e.data||{};
  if(type==="load")load();
  if(type==="analyze")analyze(image);
});
