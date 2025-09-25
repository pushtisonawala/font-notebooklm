import { makeHttpReq } from "@/helper/makeHttpReq";

import type { AuthDataType } from "@/types/auth-types";



export async function getAuthUserData(): Promise<AuthDataType>{

     const data=await makeHttpReq('GET','auth/me')as {authData:AuthDataType}
    return data?.authData
    
 
}