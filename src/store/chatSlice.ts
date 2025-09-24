import { createSlice, configureStore } from '@reduxjs/toolkit'

const chatSlice = createSlice({
    name: 'chat',
    initialState: {
        leftPanelOpen: false,
        rightPanelOpen: false,
        middlePanelDefaultWidth: 50
    },
    reducers: {
        addExtraWidth: state => {

            state.middlePanelDefaultWidth += 21
        },
        reduceExtraWidth: state => {

            state.middlePanelDefaultWidth -= 21
        },

         toggleLeftPanel: state => {

            state.leftPanelOpen=!state.leftPanelOpen
        },

        
         toggleRightPanel: state => {

            state.rightPanelOpen=!state.rightPanelOpen
        },



       

       
    }
})

export const { addExtraWidth,toggleLeftPanel,toggleRightPanel, reduceExtraWidth } = chatSlice.actions



export default chatSlice.reducer