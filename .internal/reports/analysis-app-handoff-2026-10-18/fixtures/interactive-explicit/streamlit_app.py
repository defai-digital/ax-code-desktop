"""Sales Explorer — interactive filter, chart, and CSV download."""

import pandas as pd
import streamlit as st

st.set_page_config(page_title="Sales Explorer", layout="wide")
st.title("Sales Explorer")

CSV_FILE = "sales.csv"


@st.cache_data
def load_data(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["month"] = pd.to_datetime(df["month"])
    return df


try:
    df = load_data(CSV_FILE)
except FileNotFoundError:
    st.error(f"Could not find {CSV_FILE}. Place it next to this app and reload.")
    st.stop()

regions = sorted(df["region"].unique().tolist())
selected = st.sidebar.multiselect("Region", regions, default=regions)

if not selected:
    st.info("Pick at least one region to see results.")
    st.stop()

filtered = df[df["region"].isin(selected)].sort_values(["month", "region"])
monthly = filtered.groupby("month", as_index=False)["revenue"].sum()

c1, c2 = st.columns([3, 1])
with c1:
    st.subheader("Monthly Revenue")
    st.line_chart(monthly, x="month", y="revenue")
with c2:
    st.metric("Rows", len(filtered))
    st.metric("Total Revenue", f"${filtered['revenue'].sum():,.0f}")

st.subheader("Filtered Data")
st.dataframe(filtered, use_container_width=True, hide_index=True)

st.download_button(
    "Download filtered CSV",
    data=filtered.to_csv(index=False).encode("utf-8"),
    file_name="sales_filtered.csv",
    mime="text/csv",
)
