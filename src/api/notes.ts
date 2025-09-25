import { makeHttpReq } from "@/helper/makeHttpReq";
import type { NoteServerData } from "@/types/note-types";


export async function getNotes(): Promise<NoteServerData>{

     const data=await makeHttpReq('GET','notes') as {notes:NoteServerData}
    return data?.notes
    
 
}