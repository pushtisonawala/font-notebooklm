import { apiUrl } from "@/config/get-env"

export type HttpVerbType = 'GET' | 'POST' | 'PUT' | 'DELETE'
export function makeHttpReq<T>(verb: HttpVerbType, endpoint: string, input?: T) {

    return new Promise(async (resolve, reject) => {

        try {
            const res = await fetch(`${apiUrl}/api/v1/${endpoint}`, {
                method: verb,
                credentials: "include",
                headers: {
                    accept: "application/json",
                },
                body: JSON.stringify(input)
            })
            if (!res.ok) throw new Error('failed to process this request')
            const data = res.json()
            resolve(data)
        } catch (error) {

            reject(error)

        }


    })
}