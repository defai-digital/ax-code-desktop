"""Local compatibility fixture; no AX Code runtime or controller is hosted here."""
import hashlib
import os
import time

import streamlit as st

project = os.environ.get("AX_STREAMLIT_PROJECT", "alpha")
st.title("Streamlit preview fixture")
st.write(f"Project: {project}")
st.session_state.setdefault("count", 0)
if st.button("Increment"):
    st.session_state.count += 1
st.write(f"Count: {st.session_state.count}")

with st.form("message"):
    message = st.text_input("Message", value="fixture message")
    if st.form_submit_button("Submit form"):
        st.success(f"Submitted: {message}")

if st.button("Stream text"):
    def chunks():
        for value in ["FIRST ", "SECOND ", "COMPLETE"]:
            yield value
            time.sleep(0.5)
    st.write_stream(chunks())

upload = st.file_uploader("Upload fixture", type=["txt"])
if upload:
    st.write(f"Uploaded SHA256: {hashlib.sha256(upload.getvalue()).hexdigest()}")
st.download_button("Download fixture", data=f"download:{project}\n", file_name=f"{project}.txt", mime="text/plain")
