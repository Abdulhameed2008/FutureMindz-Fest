export async function api<T>(path:string, options:RequestInit={}):Promise<T> {
  const response=await fetch(`/api${path}`,{...options,headers:options.body instanceof FormData?options.headers:{'Content-Type':'application/json',...options.headers}});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Request failed. Please try again.');
  return data as T;
}
export function download(name:string,data:unknown):void {
 const blob=new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
