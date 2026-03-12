import { createSlice, configureStore } from '@reduxjs/toolkit'

const chatSlice = createSlice({
    name: 'chat',
    initialState: {
        leftPanelOpen: true,
        rightPanelOpen: true,
        middlePanelDefaultWidth: 50,
        selectedFiles: [] // Array of selected file objects
    },
    reducers: {
        addExtraWidth: state => {

            state.middlePanelDefaultWidth += 21
        },
        reduceExtraWidth: state => {

            state.middlePanelDefaultWidth -= 21
        },

        toggleLeftPanel: state => {

            state.leftPanelOpen = !state.leftPanelOpen
        },


        toggleRightPanel: state => {

            state.rightPanelOpen = !state.rightPanelOpen
        },
        setSelectedFiles: (state, action) => {
            state.selectedFiles = action.payload;
        },
    }
})

export const { addExtraWidth, toggleLeftPanel, toggleRightPanel, reduceExtraWidth, setSelectedFiles } = chatSlice.actions

export default chatSlice.reducer