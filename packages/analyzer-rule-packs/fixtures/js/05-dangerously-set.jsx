function App({ html }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
