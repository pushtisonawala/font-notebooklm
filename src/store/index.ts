import { configureStore } from "@reduxjs/toolkit";
import chatSlice  from './chatSlice'
import { useDispatch } from "react-redux";
import notesSlice from './noteSlice'
import  addSourceSlice  from "./addSourceSlice";
export const store = configureStore({
  reducer: {
     chat:chatSlice,
     note:notesSlice,
     addSource:addSourceSlice
  },
})
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;





