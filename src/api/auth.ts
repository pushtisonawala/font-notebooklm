import { makeHttpReq } from "@/helper/makeHttpReq";

import type { AuthDataType } from "@/types/auth-types";



export async function getAuthUserData(): Promise<AuthDataType> {

    const data = await makeHttpReq('GET', 'auth/me') as { authData: AuthDataType }
    return data?.authData


}


export async function logoutUser(): Promise<void> {

    try {
        const data = await makeHttpReq('GET', 'logout') as { message: string }
        localStorage.clear()
        window.location.href = '/auth/login'
        console.log(data?.message)

    } catch (error) {
        console.log('failed to logout')

    }


}