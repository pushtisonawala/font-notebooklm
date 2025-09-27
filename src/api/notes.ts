import { makeHttpReq } from "@/helper/makeHttpReq";
import type { NoteServerData } from "@/types/note-types";


export async function getNotes(page=1,search:string=''): Promise<NoteServerData>{

     const data=await makeHttpReq('GET',`notes?page=${page}&search=${search}`)as NoteServerData
    return data
    
 
}