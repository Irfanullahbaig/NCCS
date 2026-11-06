import Image from "next/image";
import type { Scene } from "@/site/data/scenes";

export function PhotoMosaic({ items }: { items: Scene[] }) {
  return (
    <div className="mosaic">
      {items.map((item, index) => (
        <figure className="media" key={item.id} data-span={index === 0 ? "featured" : undefined}>
          <Image
            src={item.image}
            alt={item.alt}
            fill
            sizes={index === 0 ? "(min-width: 900px) 46vw, 100vw" : "(min-width: 900px) 24vw, 50vw"}
            style={{ objectPosition: item.focal ?? "center" }}
          />
          <figcaption>{item.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
