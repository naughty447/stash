import React, { useState } from "react";
import { Button } from "react-bootstrap";
import Icon from "src/components/Shared/Icon";
import { faStar as fasStar } from "@fortawesome/free-solid-svg-icons";
import { faStar as farStar } from "@fortawesome/free-regular-svg-icons";
import {
  convertFromRatingFormat,
  convertToRatingFormat,
  getRatingPrecision,
  RatingStarPrecision,
  RatingSystemType,
} from "src/utils/rating";
import { useIntl } from "react-intl";

export interface IRatingStarsProps {
  value?: number;
  onSetRating?: (value?: number) => void;
  disabled?: boolean;
  precision: RatingStarPrecision;
}

export const RatingStars: React.FC<IRatingStarsProps> = (
  props: IRatingStarsProps
) => {
  const intl = useIntl();
  const [hoverRating, setHoverRating] = useState<number | undefined>();
  const disabled = props.disabled || !props.onSetRating;

  const rating = convertToRatingFormat(props.value, {
    type: RatingSystemType.Stars,
    starPrecision: props.precision,
  });
  const stars = rating ? Math.floor(rating) : 0;
  const fraction = rating ? rating % 1 : 0;

  const max = 5;
  const precision = getRatingPrecision(props.precision);

  function newToggleFraction() {
    if (precision !== 1) {
      if (fraction !== precision) {
        if (fraction == 0) {
          return 1 - precision;
        }

        return fraction - precision;
      }
    }
  }

  function setRating(thisStar: number) {
    if (!props.onSetRating) {
      return;
    }

    let newRating: number | undefined = thisStar;

    // toggle rating fraction if we're clicking on the current rating
    if (
      (stars === thisStar && !fraction) ||
      (stars + 1 === thisStar && fraction)
    ) {
      const f = newToggleFraction();
      if (!f) {
        newRating = undefined;
      } else if (fraction) {
        // we're toggling from an existing fraction so use the stars value
        newRating = stars + f;
      } else {
        // we're toggling from a whole value, so decrement from current rating
        newRating = stars - 1 + f;
      }
    }

    // set the hover rating to undefined so that it doesn't immediately clear
    // the stars
    setHoverRating(undefined);

    if (!newRating) {
      props.onSetRating(undefined);
      return;
    }

    props.onSetRating(
      convertFromRatingFormat(newRating, RatingSystemType.Stars)
    );
  }

  function onMouseOver(thisStar: number) {
    if (!disabled) {
      setHoverRating(thisStar);
    }
  }

  function onMouseOut(thisStar: number) {
    if (!disabled && hoverRating === thisStar) {
      setHoverRating(undefined);
    }
  }

  function getClassName(thisStar: number) {
    if (hoverRating && hoverRating >= thisStar) {
      if (hoverRating === stars) {
        return "unsetting";
      }

      return "setting";
    }

    if (stars && stars >= thisStar) {
      return "set";
    }

    return "unset";
  }

  function getTooltip(thisStar: number, current: RatingFraction | undefined) {
    if (disabled) {
      if (rating) {
        // always return current rating for disabled control
        return rating.toString();
      }

      return undefined;
    }

    // adjust tooltip to use fractions
    if (!current) {
      return intl.formatMessage({ id: "actions.unset" });
    }

    return (current.rating + current.fraction).toString();
  }

  type RatingFraction = {
    rating: number;
    fraction: number;
  };

  function getCurrentSelectedRating(): RatingFraction | undefined {
    let r: number = hoverRating ? hoverRating : stars;
    let f: number | undefined = fraction;

    if (hoverRating) {
      if (hoverRating === stars && precision === 1) {
        // unsetting
        return undefined;
      }
      if (hoverRating === stars + 1 && fraction && fraction === precision) {
        // unsetting
        return undefined;
      }

      if (f && hoverRating === stars + 1) {
        f = newToggleFraction();
        r--;
      } else if (!f && hoverRating === stars) {
        f = newToggleFraction();
        r--;
      } else {
        f = 0;
      }
    }

    return { rating: r, fraction: f ?? 0 };
  }

  function getButtonClassName(
    thisStar: number,
    current: RatingFraction | undefined
  ) {
    if (!current || thisStar > current.rating + 1) {
      return "star-fill-0";
    }

    if (thisStar <= current.rating) {
      return "star-fill-100";
    }

    let w = current.fraction * 100;
    return `star-fill-${w}`;
  }

  const renderRatingButton = (thisStar: number) => {
    const ratingFraction = getCurrentSelectedRating();

    return (
      <Button
        disabled={disabled}
        className={`minimal ${getButtonClassName(thisStar, ratingFraction)}`}
        onClick={() => setRating(thisStar)}
        variant="secondary"
        onMouseEnter={() => onMouseOver(thisStar)}
        onMouseLeave={() => onMouseOut(thisStar)}
        onFocus={() => onMouseOver(thisStar)}
        onBlur={() => onMouseOut(thisStar)}
        title={getTooltip(thisStar, ratingFraction)}
        key={`star-${thisStar}`}
      >
        <div className="filled-star">
          <Icon icon={fasStar} className="set" />
        </div>
        <div className="unfilled-star">
          <Icon icon={farStar} className={getClassName(thisStar)} />
        </div>
      </Button>
    );
  };

  return (
    <div className="rating-stars">
      {Array.from(Array(max)).map((value, index) =>
        renderRatingButton(index + 1)
      )}
    </div>
  );
};
