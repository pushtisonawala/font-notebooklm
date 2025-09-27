

export type PaginationType={
    total:number 
    page:number 
    limit:number
    totalPages:number
}
export type NoteType={
    _id:string
    title:string 
    image:string 
    userId:string 
    createdAt:string
}

export type NoteServerData={notes:NoteType[]} & {pagination?:PaginationType}