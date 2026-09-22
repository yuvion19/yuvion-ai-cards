import {
  AutoProcessor,
  AutoModelForVision2Seq,
  load_image,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1";

class LocalVision {
  static modelId = "HuggingFaceTB/SmolVLM-256M-Instruct";
  static processor = null;
  static model = null;
  static async get(progress_callback=null){
    this.processor ??= AutoProcessor.from_pretrained(this.modelId,{progress_callback});
    this.model ??= AutoModelForVision2Seq.from_pretrained(this.modelId,{
      dtype:"fp32",device:"webgpu",progress_callback
    });
    return Promise.all([this.processor,this.model]);
  }
}

async function load(){
  self.postMessage({status:"loading"});
  try{
    await LocalVision.get((x)=>self.postMessage(x));
    self.postMessage({status:"ready"});
  }catch(e){
    self.postMessage({status:"error",data:String(e?.message||e)});
  }
}

async function analyze(imageUrl){
  try{
    const [processor,model]=await LocalVision.get((x)=>self.postMessage(x));
    const image=await load_image(imageUrl);
    const prompt=[
      "Analyze the product in the image. Do not invent dimensions, material, power, composition, model number, brand, or technical specifications.",
      "Return ONLY valid JSON and no markdown.",
      "Use Russian language for string values when possible.",
      'Schema: {"productName":"", "category":"", "colors":[], "visibleFeatures":[], "visibleText":[], "packageType":""}.',
      "visibleFeatures must contain only directly visible physical features. visibleText only text you can actually read."
    ].join(" ");
    const messages=[{role:"user",content:[{type:"image"},{type:"text",text:prompt}]}];
    const text=processor.apply_chat_template(messages,{add_generation_prompt:true});
    const inputs=await processor(text,[image],{do_image_splitting:false});
    const output=await model.generate({
      ...inputs,do_sample:false,repetition_penalty:1.08,max_new_tokens:260
    });
    const decoded=processor.batch_decode(output,{skip_special_tokens:true});
    let answer=String(decoded?.[0]||"");
    const marker="Assistant:";
    if(answer.includes(marker))answer=answer.split(marker).pop().trim();
    self.postMessage({status:"complete",output:answer});
  }catch(e){
    self.postMessage({status:"error",data:String(e?.message||e)});
  }
}

self.addEventListener("message",(e)=>{
  const {type,image}=e.data||{};
  if(type==="load")load();
  if(type==="analyze")analyze(image);
});
