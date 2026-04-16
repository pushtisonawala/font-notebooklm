import { createSlice } from '@reduxjs/toolkit'

const chatSlice = createSlice({
    name: 'chat',
    initialState: {
        leftPanelOpen: true,
        rightPanelOpen: true,
        middlePanelDefaultWidth: 50,
        selectedFiles: [] as any[], // Array of selected file objects
        activeStudioTool: null as string | null,
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
        setActiveStudioTool: (state, action) => {
            state.activeStudioTool = action.payload;
        },
    }
})

export const { addExtraWidth, toggleLeftPanel, toggleRightPanel, reduceExtraWidth, setSelectedFiles, setActiveStudioTool } = chatSlice.actions

export default chatSlice.reducer
