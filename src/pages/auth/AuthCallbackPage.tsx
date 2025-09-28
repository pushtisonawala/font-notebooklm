import { getAuthUserData } from "@/api/auth"
import { useEffect } from "react"

function AuthCallbackPage() {


    const getUserData = async () => {
        try {


            const data = await getAuthUserData()
            if (data) {
                const { _id, name, email, image,googleAccessToken, ...resProps } = data
                const user = { _id, name, email, image ,googleAccessToken}
                localStorage.setItem('userData', JSON.stringify(user))
                window.location.href='/notes'

            }

        } catch (error) {

        }



    }

    useEffect(() => {
        getUserData()
    }, [])



    return (
        <>
            <div>
                Authenticate....
            </div>
        </>
    )
}

export default AuthCallbackPage
