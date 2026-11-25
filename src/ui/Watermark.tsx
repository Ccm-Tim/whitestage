export function Watermark({
  placement = 'start',
}: {
  placement?: 'start' | 'inspector'
}) {
  return (
    <div
      className={`cc-watermark ${placement}`}
      title="作者：CC菜 · 仅供分享学习使用，请勿商用"
      aria-label="CC菜，仅供分享学习使用，请勿商用"
    >
      <b>CC菜</b>
      <span>仅供分享学习使用</span>
      <span>请勿商用</span>
    </div>
  )
}
