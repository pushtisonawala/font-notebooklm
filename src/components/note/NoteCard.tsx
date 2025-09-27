
import type { NoteType } from '@/types/note-types';
import { formatDate } from '@/util/formatDate';
import { truncateTitle } from '@/util/truncateTitle';

import DefaultImage from '@/assets/default.png'
import { Ellipsis } from 'lucide-react';
// type Note = {
//     id: number;
//     title: string;
//     date: string;
//     sources: number;
//     color: string;
//     image?: string;
// };



type NoteCardProps = {
    notebooks: NoteType[];
};
const NoteCard = ({ notebooks }: NoteCardProps) => {
    return (<>
        {
            notebooks.map((note: NoteType) => (

                <div
                    key={note._id}
                    className={`relative p-4 rounded-xl shadow-sm hover:shadow-md transition h-52 bg-white`}
                >

                    {/* Image at top */}
                    <div className="h-24">
                        <img
                            src={note.image || DefaultImage} // fallback if no image
                            onError={(e) => {
                                e.currentTarget.src = DefaultImage;
                            }}
                            className="pt-2"
                            width={100}
                        />
                    </div>

                    {/* Content */}
                    <div className="flex flex-col  justify-between ">
                        <h2 className="text-xl  font-semibold text-gray-800 line-clamp-2">
                            {truncateTitle(note.title)}
                        </h2>
                        <p className="text-xs text-gray-500 pt-2">
                            {formatDate(note.createdAt)} •  sources
                        </p>
                    </div>
                </div>
            ))
        } </>);
}

export default NoteCard;