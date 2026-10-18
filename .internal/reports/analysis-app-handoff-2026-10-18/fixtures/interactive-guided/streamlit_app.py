import streamlit as st
import pandas as pd
from pathlib import Path

REQUIRED = ["month", "region", "revenue"]
DEFAULT_CSV = Path(__file__).resolve().parent / "sales.csv"

st.title("Sales revenue by month")
st.caption(
    "Upload a CSV (columns: month, region, revenue) or use the bundled sales.csv."
)


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [c.strip().lower() for c in df.columns]
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        st.error(f"Missing required column(s): {', '.join(missing)}.")
        st.stop()
    df["month"] = df["month"].astype(str).str.strip()
    df["revenue"] = pd.to_numeric(df["revenue"], errors="coerce")
    dropped = int(df["revenue"].isna().sum())
    if dropped:
        st.warning(f"Ignored {dropped} row(s) with non-numeric revenue.")
    return df.dropna(subset=["revenue"]).reset_index(drop=True)


upload = st.file_uploader("Upload CSV", type=["csv"])
if upload is not None:
    df, source = prepare(pd.read_csv(upload)), upload.name
elif DEFAULT_CSV.exists():
    df, source = prepare(pd.read_csv(DEFAULT_CSV)), DEFAULT_CSV.name
else:
    st.info("No data yet — upload a CSV or add sales.csv next to this app.")
    st.stop()

regions = sorted(df["region"].astype(str).unique())
region = st.selectbox("Region", regions, index=0)
view = df[df["region"].astype(str) == region].sort_values("month")
monthly = view.groupby("month", sort=False)["revenue"].sum()

st.subheader(f"Monthly revenue — {region}")
st.bar_chart(monthly)
st.markdown(f"**Total:** {monthly.sum():,.0f} · **Months:** {len(monthly)}")

st.download_button(
    "Download filtered rows (CSV)",
    data=view.to_csv(index=False).encode("utf-8"),
    file_name=f"sales_{region.lower().replace(' ', '_')}.csv",
    mime="text/csv",
)
st.caption(f"Source: {source}")
