



export function getUserData(){

    try {

        const userData=localStorage.getItem('userData')

        if(typeof userData!=='object'){
            const parsedData=JSON.parse(userData)

            return parsedData
        }
        
    } catch (error) {
        

        console.log('failed to parsed user data')
    }
}