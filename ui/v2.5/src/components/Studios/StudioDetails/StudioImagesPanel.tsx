import React from "react";
import * as GQL from "src/core/generated-graphql";
import { useStudioFilterHook } from "src/core/studios";
import { ImageList } from "src/components/Images/ImageList";

interface IStudioImagesPanel {
  active: boolean;
  studio: GQL.StudioDataFragment;
}

export const StudioImagesPanel: React.FC<IStudioImagesPanel> = ({
  active,
  studio,
}) => {
  const filterHook = useStudioFilterHook(studio);
  return <ImageList filterHook={filterHook} alterQuery={active} />;
};
