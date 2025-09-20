import BrainImage from '@/assets/brain.png'

type Note = {
    id: number;
    title: string;
    date: string;
    sources: number;
    color: string;
    image?: string;
};



type NoteCardProps = {
    notebooks: Note[];
};
const NoteCard = ({ notebooks }: NoteCardProps) => {
    return (<>
        {
            notebooks.map((note: Note) => (

                <div
                    key={note.id}
                    className={`relative p-4 rounded-xl shadow-sm hover:shadow-md transition h-52 ${note.color}`}
                >
                   
                    {/* Image at top */}
                    <div className="h-24 w-full mb-2">
                        <img
                            src={note.image || BrainImage} // fallback if no image
                            alt={note.title}
                            className=""
                        />
                    </div>

                    {/* Content */}
                    <div className="flex flex-col justify-between h-[calc(100%-7rem)]">
                        <h2 className="text-xl font-semibold text-gray-800 line-clamp-2">
                            {note.title}
                        </h2>
                        <p className="text-xs text-gray-500">
                            {note.date} • {note.sources} sources
                        </p>
                    </div>
                </div>
            ))
        } </> );
}
 
export default NoteCard;