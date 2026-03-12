



export function getUserData() {
    try {
        const userData = localStorage.getItem('userData');
        if (!userData) {
            return null;
        }
        return JSON.parse(userData);
    } catch (error) {
        console.log('failed to parse user data');
        return null;
    }
}